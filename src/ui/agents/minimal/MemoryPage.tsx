// Explorer for delayed response / short-term memory (Slocum, Downey & Beer 2000, §5).

import { useDeferredValue, useMemo } from 'react';
import {
  memoryAgent, memoryAssumptions, memoryStateFor, memoryEvalTrials, memoryEye, memoryPerformance, randomMemoryTrials, runMemoryTrials,
  type MemoryState, type MemoryTask,
} from '../../../sim/agents/minimal/memory';
import { AgentDynamicsCard } from '../../components/AgentDynamicsCard';
import { NumberField, SelectField } from '../../components/controls';
import type { PhaseOverlay } from '../../components/PhasePortrait';
import { Transport } from '../../components/Transport';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { fmt } from '../../plot';
import { useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';
import { AssumptionList, CircuitCards } from './MinimalCommon';
import { AccuracyPlot, FallArena, PositionsOverTime, RelativePaths } from './MinimalViews';

const agent = memoryAgent;

function fromUrl(s: unknown): MemoryState | null {
  if (!s || typeof s !== 'object' || !('circuit' in s) || !('task' in s)) return null;
  const d = agent.defaultParams(), v = s as MemoryState;
  return { ...d, ...v, trial: { ...d.trial, ...v.trial } };
}

const defaultAxes = (s: MemoryState): [string, string] => [`o${s.circuit.size - 1}`, `o${s.circuit.size}`];
const taskName: Record<MemoryTask, string> = { vertical: 'Vertical falls', diagonal: 'Diagonal falls' };

export function MemoryPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, rec, cur, window } = ex;
  const deferred = useDeferredValue(state);
  const evalTrials = useMemo(() => memoryEvalTrials(deferred.task), [deferred.task]);
  const randomTrials = useMemo(() => randomMemoryTrials(deferred.task, 200, 2000), [deferred.task]);
  const evalPerf = useMemo(() => memoryPerformance(deferred, deferred.task, evalTrials, deferred.dt, deferred.blindAfter), [deferred, evalTrials]);
  const results = useMemo(() => runMemoryTrials(deferred, evalTrials), [deferred, evalTrials]);
  const randomResults = useMemo(() => runMemoryTrials(deferred, randomTrials), [deferred, randomTrials]);
  const randomPerf = useMemo(() => memoryPerformance(deferred, deferred.task, randomTrials, deferred.dt, deferred.blindAfter), [deferred, randomTrials]);
  const objColor = [theme.series[0]];
  const setTrial = (patch: Partial<MemoryState['trial']>) => { ex.setState({ ...state, trial: { ...state.trial, ...patch } }); ex.setIdx(0); };
  const switchTask = (t: MemoryTask) => {
    if (t === state.task) return;
    const p = agent.presets.map((q) => q.params()).find((q) => q.task === t);
    // No preset for that task yet: start from an untrained circuit of the right size
    ex.resetTo(p ? { ...p, dt: state.dt, blindAfter: state.blindAfter } : memoryStateFor(t, new Array(agent.genomeSize({ ...ex.evoConfig, task: t })).fill(0)));
    ex.setIdx(0);
  };

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const pinRecs = useMemo(() => ex.pins.map((p) => agent.simulate({ ...p.params, trial: state.trial })), [ex.pins, state.trial]);
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: pinRecs[k], color: pinColors[k], label: p.label }));
  const bodyRows = useMemo(() => [
    { key: 'relX1', label: 'Δx', color: theme.text },
    { key: 'blind', label: 'blind', color: theme.text2, range: [0, 1] as [number, number], step: true },
  ], [theme]);
  const blindT = rec.summary.blindT;

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => ex.resetTo(agent.defaultParams())}>Reset</button>
        </div>
        <details className="section" open>
          <summary>Trial</summary>
          <div className="section-body">
            <SelectField label="preset" value="" onChange={(v) => { const p = agent.presets[Number(v)]; if (p) { ex.resetTo(p.params()); ex.setIdx(0); } }}
              options={[{ value: '', label: agent.presets.length ? 'Load a preset…' : 'No presets yet' }, ...agent.presets.map((p, i) => ({ value: String(i), label: p.name }))]} />
            <NumberField label="start offset" value={state.trial.x} min={-55} max={55} step={1} onChange={(x) => setTrial({ x })} />
            {state.task === 'diagonal' && <NumberField label="horizontal velocity" value={state.trial.vx} min={-1} max={1} step={0.05} onChange={(vx) => setTrial({ vx })} />}
            <NumberField label="blind after moving" value={state.blindAfter} min={0.01} max={5} step={0.01} onChange={(blindAfter) => ex.setState({ ...state, blindAfter })} />
            <p className="note">{state.arch.sensors} ray neurons, {state.arch.inter} interneurons and 2 motor neurons ({agent.genomeSize(agent.defaultEvoConfig(state))} genes). Objects fall at speed 2.</p>
          </div>
        </details>
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>Delayed response</h2>
            <div className="spacer" />
            <div className="inline">
              {(['vertical', 'diagonal'] as const).map((t) => (
                <button key={t} className="tab" aria-current={state.task === t ? 'page' : undefined} onClick={() => switchTask(t)}>{taskName[t]}</button>
              ))}
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>{agent.citation}</p>
          <p className="small secondary" style={{ marginBottom: 8 }}>
            The agent must catch a falling circle, but its eyes switch off for good <b>as soon as it starts to move</b>. So it has to watch, decide
            when to go, and then move by just the right amount without seeing anything. Whatever it learned about the object while waiting has to be
            carried in its neural dynamics. {state.task === 'diagonal'
              ? 'Here objects also drift sideways (horizontal velocity in ±1), so the agent must estimate the drift as well as the position before it moves. Moving within the first 5 steps costs a 20-point penalty.'
              : 'Here objects fall straight down. Slocum et al.\'s best agent waited until the object crossed its outermost ray, then moved at a steady 0.53 ≈ 2 / tan(5π/12), the speed that brings it under the object just in time.'}
          </p>
          <AssumptionList items={memoryAssumptions} />
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(Math.abs(rec.summary.dx), 1)}</span><span className="l">miss distance this trial</span></div>
            <div className="stat"><span className="v num">{Number.isNaN(blindT) ? 'never' : `t = ${fmt(blindT, 1)}`}</span><span className="l">went blind</span></div>
            <div className="stat"><span className="v num">{fmt(evalPerf * 100, 1)}%</span><span className="l">{evalTrials.length} evaluation trials</span></div>
            <div className="stat"><span className="v num">{fmt(randomPerf * 100, 1)}%</span><span className="l">200 random trials (paper: {state.task === 'vertical' ? '99.3%' : '95.7%'})</span></div>
          </div>
          <div className="split-2">
            <FallArena rec={rec} idx={cur} eye={memoryEye} objects={1} colors={objColor} />
            <PositionsOverTime rec={rec} idx={cur} objects={1} colors={objColor} onSeek={ex.setIdx} height={250} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Transport t={rec.t} idx={cur} onSeek={ex.setIdx} playing={ex.playing} onPlaying={ex.setPlaying}
              speed={ex.speed} onSpeed={ex.setSpeed} window={window} onWindow={ex.setWin} />
          </div>
        </div>

        <CircuitCards state={state} rec={rec} cur={cur} window={window} onSeek={ex.setIdx} channels={ex.channels} circuitView={ex.circuitView}
          axes={ex.axes} onAxes={(x, y) => ex.setAxes([x, y])} overlays={overlays} bodyRows={bodyRows} />

        <div className="row-2">
          <div className="card">
            <div className="card-head"><h2>Evaluation trials</h2><span className="muted small">object paths relative to the agent; click to load</span></div>
            <RelativePaths items={results.map((r) => ({ paths: r.paths, label: `x ${fmt(r.trial.x, 1)}${state.task === 'diagonal' ? `, vx ${fmt(r.trial.vx, 2)}` : ''}: miss ${fmt(Math.abs(r.dx), 1)}`, selected: r.trial.x === state.trial.x && r.trial.vx === state.trial.vx }))}
              colors={objColor} onSelect={(k) => setTrial(results[k].trial)} />
            <p className="small muted">Slocum et al. Figures 10 and 12. Lines bend where the agent starts to move, which is also when it goes blind.</p>
          </div>
          <div className="card">
            <div className="card-head"><h2>Accuracy</h2><span className="muted small">200 random trials</span></div>
            <AccuracyPlot points={randomResults.map((r) => ({ object: r.finalObjectX, agent: r.finalAgentX }))} color={theme.series[0]} range={state.task === 'vertical' ? 60 : 120} />
            <p className="small muted">Slocum et al. Figures 9 and 11. A perfect blind catcher ends on the dashed diagonal. Errors cluster near the midline (the object reaches the outer ray too late) and at the periphery (every far object looks the same).</p>
          </div>
        </div>

        {ex.circuitView && <AgentDynamicsCard view={ex.circuitView} rec={rec} idx={cur} onCircuit={(circuit) => ex.setState({ ...state, circuit })} />}

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[{ label: 'miss (this trial)', value: (p) => fmt(Math.abs(pinRecs[ex.pins.indexOf(p)]?.summary.dx ?? NaN), 1) }]} />

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<>
            <SelectField<MemoryTask> label="task" value={ex.evoConfig.task} onChange={(task) => ex.setEvoConfig({ ...ex.evoConfig, task })}
              options={[{ value: 'vertical', label: 'vertical (4 interneurons, 56 genes)' }, { value: 'diagonal', label: 'diagonal (6 interneurons, 82 genes)' }]} />
            <p className="small muted">Bilaterally symmetric; ray neurons share one time constant, bias ([−10, 0]) and gain ([1, 5]); weights and other biases in
              [−5, 5], time constants in [1, 2]. Fitness: (200 − mean miss) / 200 over the evaluation trials. The paper used a population of 100 for
              500 generations (vertical) and 5000 (diagonal).</p>
          </>} />
      </div>
    </div>
  );
}
