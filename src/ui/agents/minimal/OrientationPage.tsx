// Explorer for visually guided orientation (Beer 1996): reactive vs. dynamical agents.

import { useDeferredValue, useMemo } from 'react';
import {
  orientAssumptions, orientationAgent, orientEvalTrials, orientEye, orientPerformance, randomOrientTrials, runOrientTrials,
  type OrientState,
} from '../../../sim/agents/minimal/orientation';
import { AgentDynamicsCard } from '../../components/AgentDynamicsCard';
import { NumberField, SelectField } from '../../components/controls';
import type { PhaseOverlay } from '../../components/PhasePortrait';
import { Transport } from '../../components/Transport';
import { WeightMatrix } from '../../components/WeightMatrix';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { fmt } from '../../plot';
import { useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';
import { AssumptionList, CircuitCards } from './MinimalCommon';
import { FallArena, PositionsOverTime, RelativePaths } from './MinimalViews';

const agent = orientationAgent;

function fromUrl(s: unknown): OrientState | null {
  if (!s || typeof s !== 'object' || !('circuit' in s) || !('kind' in s)) return null;
  const d = agent.defaultParams(), v = s as OrientState;
  return { ...d, ...v, trial: { ...d.trial, ...v.trial } };
}

const defaultAxes = (s: OrientState): [string, string] => [`o${s.circuit.size - 1}`, `o${s.circuit.size}`];
const random100 = randomOrientTrials(100, 1996);

export function OrientationPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, rec, cur, window } = ex;
  const deferred = useDeferredValue(state);
  const evalPerf = useMemo(() => orientPerformance(deferred, orientEvalTrials, deferred.dt), [deferred]);
  const randomPerf = useMemo(() => orientPerformance(deferred, random100, deferred.dt), [deferred]);
  const results = useMemo(() => runOrientTrials(deferred, orientEvalTrials), [deferred]);
  const objColor = [theme.series[0]];
  // The other kind of agent (reactive vs dynamical) on the same trial, from the presets
  const other = useMemo(() => {
    const p = agent.presets.map((q) => q.params()).find((q) => q.kind !== state.kind);
    return p ? { state: p, rec: agent.simulate({ ...p, trial: state.trial, dt: state.dt }) } : null;
  }, [state.kind, state.trial, state.dt]);
  const setTrial = (patch: Partial<OrientState['trial']>) => { ex.setState({ ...state, trial: { ...state.trial, ...patch } }); ex.setIdx(0); };

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const pinRecs = useMemo(() => ex.pins.map((p) => agent.simulate({ ...p.params, trial: state.trial })), [ex.pins, state.trial]);
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: pinRecs[k], color: pinColors[k], label: p.label }));
  const bodyRows = useMemo(() => [{ key: 'relX1', label: 'Δx', color: theme.text }], [theme]);
  const kindName = (k: string) => (k === 'reactive' ? 'Reactive (feedforward)' : 'Dynamical (recurrent motors)');

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => ex.resetTo(agent.defaultParams())}>Reset</button>
        </div>
        <details className="section" open>
          <summary>Trial</summary>
          <div className="section-body">
            <SelectField label="preset" value="" onChange={(v) => { const p = agent.presets[Number(v)]; if (p) { ex.resetTo({ ...p.params(), trial: state.trial }); ex.setIdx(0); } }}
              options={[{ value: '', label: agent.presets.length ? 'Load a preset…' : 'No presets yet' }, ...agent.presets.map((p, i) => ({ value: String(i), label: p.name }))]} />
            <NumberField label="start offset" value={state.trial.x} min={-70} max={70} step={1} onChange={(x) => setTrial({ x })} />
            <NumberField label="horizontal velocity" value={state.trial.vx} min={-6} max={6} step={0.1} onChange={(vx) => setTrial({ vx })} />
            <NumberField label="fall speed" value={-state.trial.vy} min={0.5} max={5} step={0.1} onChange={(v) => setTrial({ vy: -Math.abs(v) })} />
            <button className="btn small" onClick={() => setTrial(randomOrientTrials(1, Math.floor(Math.random() * 1e6) + 1)[0])}>Random trial</button>
            <p className="note">{kindName(state.kind)} agent: {state.arch.sensors} ray neurons → 2 motor neurons{state.kind === 'dynamical' ? ', with evolved time constants and motor self- and cross-connections' : ', all time constants 1'}.</p>
          </div>
        </details>
        <details className="section">
          <summary>Connection weights</summary>
          <div className="section-body">
            <WeightMatrix size={state.circuit.size} weights={state.circuit.weights} range={10} onChange={(weights) => ex.setState({ ...state, circuit: { ...state.circuit, weights } })} />
            <p className="small muted">Rows: from S1–S5 (rays, left to right), M1 (moves right), M2 (moves left).</p>
          </div>
        </details>
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>Visual orientation</h2>
            <span className="muted small">{agent.citation}</span>
          </div>
          <p className="small secondary" style={{ marginBottom: 8 }}>
            Circles fall at different speeds and angles, and the agent must catch each one by moving under it. A <b>reactive</b> agent (rays wired
            straight to the motors) stops chasing as soon as the object leaves its field of view. Giving the motor neurons time constants and
            recurrent connections lets a <b>dynamical</b> agent keep pursuing an object it can no longer see. This is Beer&apos;s first example of
            internal state mattering even in a very simple task.
          </p>
          <AssumptionList items={orientAssumptions} />
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(Math.abs(rec.summary.dx), 1)}</span><span className="l">miss distance this trial</span></div>
            <div className="stat"><span className="v num">{fmt(evalPerf * 100, 1)}%</span><span className="l">performance, 8 evaluation trials</span></div>
            <div className="stat"><span className="v num">{fmt(randomPerf * 100, 1)}%</span><span className="l">on 100 random trials (paper: reactive 90.3%, dynamical 96.6%)</span></div>
          </div>
          {other ? (
            <div className="split-2">
              {[{ r: rec, label: `${kindName(state.kind)} (this agent)` }, { r: other.rec, label: `${kindName(other.state.kind)} (preset)` }].map(({ r, label }) => (
                <div key={label}>
                  <div className="small" style={{ marginBottom: 4 }}><b>{label}</b> <span className="num secondary">miss {fmt(Math.abs(r.summary.dx), 1)}</span></div>
                  <FallArena rec={r} idx={Math.min(cur, r.t.length - 1)} eye={orientEye} objects={1} colors={objColor} />
                  <div style={{ marginTop: 4 }}><PositionsOverTime rec={r} idx={cur} objects={1} colors={objColor} onSeek={ex.setIdx} height={170} /></div>
                </div>
              ))}
            </div>
          ) : (
            <FallArena rec={rec} idx={cur} eye={orientEye} objects={1} colors={objColor} />
          )}
          <div style={{ marginTop: 8 }}>
            <Transport t={rec.t} idx={cur} onSeek={ex.setIdx} playing={ex.playing} onPlaying={ex.setPlaying}
              speed={ex.speed} onSpeed={ex.setSpeed} window={window} onWindow={ex.setWin} />
          </div>
        </div>

        <CircuitCards state={state} rec={rec} cur={cur} window={window} onSeek={ex.setIdx} channels={ex.channels} circuitView={ex.circuitView}
          axes={ex.axes} onAxes={(x, y) => ex.setAxes([x, y])} overlays={overlays} bodyRows={bodyRows} />

        <div className="card">
          <div className="card-head"><h2>Evaluation trials</h2><span className="muted small">object paths relative to the agent; click one to load it</span></div>
          <RelativePaths items={results.map((r) => ({ paths: r.paths, label: `x ${fmt(r.trial.x, 0)}, vx ${fmt(r.trial.vx, 1)}, vy ${fmt(r.trial.vy, 1)}: miss ${fmt(Math.abs(r.dx), 1)}`, selected: r.trial.x === state.trial.x && r.trial.vx === state.trial.vx && r.trial.vy === state.trial.vy }))}
            colors={objColor} onSelect={(k) => setTrial(results[k].trial)} />
          <p className="small muted">A caught object ends at 0 (the dashed line) at the bottom. Fitness is (200 − mean miss distance) / 200, the paper&apos;s performance as a fraction of its maximum.</p>
        </div>

        {ex.circuitView && <AgentDynamicsCard view={ex.circuitView} rec={rec} idx={cur} onCircuit={(circuit) => ex.setState({ ...state, circuit })} />}

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[{ label: 'miss (this trial)', value: (p) => fmt(Math.abs(pinRecs[ex.pins.indexOf(p)]?.summary.dx ?? NaN), 1) }]} />

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<>
            <SelectField label="architecture" value={ex.evoConfig.kind} onChange={(kind) => ex.setEvoConfig({ ...ex.evoConfig, kind })}
              options={[{ value: 'reactive', label: 'reactive (8 genes)' }, { value: 'dynamical', label: 'dynamical (12 genes)' }]} />
            <p className="small muted">Bilaterally symmetric, all ray neurons sharing one gain and bias (bias in [−10, 0], gain in [1, 5]); weights and
              motor biases in [−5, 5], time constants in [1, 2]. Fitness: (200 − mean miss) / 200 over the 8 evaluation trials. The paper used populations of 25 for 50 generations.</p>
          </>} />
      </div>
    </div>
  );
}
