// Explorer for selective attention (Slocum, Downey & Beer 2000, §6; Goldenberg, Garcowski & Beer 2004).

import { useDeferredValue, useMemo } from 'react';
import {
  attentionAgent, attentionAssumptions, attentionEye, attentionPerformance, categorize, categoryIndex, categoryNames, randomAttentionTrials,
  runAttentionTrials, validTrial, type AttentionState, type AttentionTrial,
} from '../../../sim/agents/minimal/attention';
import { AgentDynamicsCard } from '../../components/AgentDynamicsCard';
import { IntField, NumberField, SelectField } from '../../components/controls';
import type { PhaseOverlay } from '../../components/PhasePortrait';
import { Transport } from '../../components/Transport';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { fmt } from '../../plot';
import { useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';
import { AssumptionList, CircuitCards } from './MinimalCommon';
import { FallArena, PositionsOverTime } from './MinimalViews';

const agent = attentionAgent;

function fromUrl(s: unknown): AttentionState | null {
  if (!s || typeof s !== 'object' || !('circuit' in s) || !('arch' in s)) return null;
  const d = agent.defaultParams(), v = s as AttentionState;
  return { ...d, ...v, trial: { ...d.trial, ...v.trial } };
}

const defaultAxes = (s: AttentionState): [string, string] => [`o${s.circuit.size - 1}`, `o${s.circuit.size}`];
const paperBreakdown = ['97.5%', '97.3%', '93.6%', '90.7%'];

export function AttentionPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, rec, cur, window } = ex;
  const deferred = useDeferredValue(state);
  const evalTrials = useMemo(() => randomAttentionTrials(ex.evoConfig.trials, ex.evoConfig.seed), [ex.evoConfig.trials, ex.evoConfig.seed]);
  const testTrials = useMemo(() => randomAttentionTrials(300, 2004), []);
  const evalPerf = useMemo(() => attentionPerformance(deferred, evalTrials, deferred.dt), [deferred, evalTrials]);
  const tests = useMemo(() => runAttentionTrials(deferred, testTrials), [deferred, testTrials]);
  const testPerf = tests.reduce((a, r) => a + r.score, 0) / tests.length;
  const byCategory = categoryNames.map((_, k) => {
    const rs = tests.filter((r) => categoryIndex(r.category) === k);
    return { n: rs.length, perf: rs.length ? rs.reduce((a, r) => a + r.score, 0) / rs.length : NaN };
  });
  const worst = useMemo(() => [...tests].sort((a, b) => a.score - b.score).slice(0, 12), [tests]);
  const colors = [theme.series[0], theme.series[1]];
  const trialCat = categorize(state.trial);
  const setTrial = (t: AttentionTrial) => { ex.setState({ ...state, trial: t }); ex.setIdx(0); };
  const patch = (p: Partial<AttentionTrial>) => setTrial({ ...state.trial, ...p });

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const pinRecs = useMemo(() => ex.pins.map((p) => agent.simulate({ ...p.params, trial: state.trial })), [ex.pins, state.trial]);
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: pinRecs[k], color: pinColors[k], label: p.label }));
  const bodyRows = useMemo(() => [
    { key: 'relX1', label: 'Δx fast', color: theme.series[0] },
    { key: 'relX2', label: 'Δx slow', color: theme.series[1] },
  ], [theme]);

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
            <div className="small secondary" style={{ borderLeft: `3px solid ${colors[0]}`, paddingLeft: 6 }}>Fast object (lands first)</div>
            <NumberField label="start x" value={state.trial.x1} min={-70} max={70} step={1} onChange={(x1) => patch({ x1 })} />
            <NumberField label="horizontal v" value={state.trial.vx1} min={-2} max={2} step={0.05} onChange={(vx1) => patch({ vx1 })} />
            <NumberField label="fall speed" value={state.trial.vy1} min={3} max={4} step={0.05} onChange={(vy1) => patch({ vy1 })} />
            <div className="small secondary" style={{ borderLeft: `3px solid ${colors[1]}`, paddingLeft: 6 }}>Slow object</div>
            <NumberField label="start x" value={state.trial.x2} min={-70} max={70} step={1} onChange={(x2) => patch({ x2 })} />
            <NumberField label="horizontal v" value={state.trial.vx2} min={-2} max={2} step={0.05} onChange={(vx2) => patch({ vx2 })} />
            <NumberField label="fall speed" value={state.trial.vy2} min={1} max={2} step={0.05} onChange={(vy2) => patch({ vy2 })} />
            <button className="btn small" onClick={() => setTrial(randomAttentionTrials(1, Math.floor(Math.random() * 1e6) + 1)[0])}>Random trial</button>
            <p className="note">
              {trialCat.po ? 'Passing objects: the farther object lands first. ' : 'The nearer object lands first. '}
              {trialCat.op ? 'Object permanence: the slow object is out of view when the fast one lands.' : 'The slow object is still in view when the fast one lands.'}
              {!validTrial(state.trial) && ' (Outside the task: not both visible at the start, or too far apart to catch both.)'}
            </p>
          </div>
        </details>
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>Selective attention</h2>
            <span className="muted small">{agent.citation}</span>
          </div>
          <p className="small secondary" style={{ marginBottom: 8 }}>
            Two circles fall at once, one fast and one slow, and the agent must catch <b>both</b>. It has to attend to the one that will land first
            while ignoring the other, then turn to the second, which may have drifted out of view by then. Which object lands first isn&apos;t always
            obvious: a farther object can be falling faster. Both objects are visible at the start.
          </p>
          <AssumptionList items={attentionAssumptions} />
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(Math.abs(rec.summary.dx1), 1)} / {fmt(Math.abs(rec.summary.dx2), 1)}</span><span className="l">miss: fast / slow object</span></div>
            <div className="stat"><span className="v num">{fmt(rec.summary.score * 100, 1)}%</span><span className="l">this trial</span></div>
            <div className="stat"><span className="v num">{fmt(evalPerf * 100, 1)}%</span><span className="l">{evalTrials.length} evaluation trials</span></div>
            <div className="stat"><span className="v num">{fmt(testPerf * 100, 1)}%</span><span className="l">300 random trials (paper&apos;s best: 94.2%)</span></div>
          </div>
          <div className="split-2">
            <FallArena rec={rec} idx={cur} eye={attentionEye} objects={2} colors={colors} />
            <PositionsOverTime rec={rec} idx={cur} objects={2} colors={colors} onSeek={ex.setIdx} height={250} />
          </div>
          <p className="small muted" style={{ margin: '4px 0' }}>Right: positions over time (Slocum et al. Figure 14). Each object&apos;s path is shaded while the agent can see it; the agent is the dark line.</p>
          <Transport t={rec.t} idx={cur} onSeek={ex.setIdx} playing={ex.playing} onPlaying={ex.setPlaying}
            speed={ex.speed} onSpeed={ex.setSpeed} window={window} onWindow={ex.setWin} />
        </div>

        <CircuitCards state={state} rec={rec} cur={cur} window={window} onSeek={ex.setIdx} channels={ex.channels} circuitView={ex.circuitView}
          axes={ex.axes} onAxes={(x, y) => ex.setAxes([x, y])} overlays={overlays} bodyRows={bodyRows} />

        <div className="card">
          <div className="card-head"><h2>Kinds of trial</h2><span className="muted small">300 random trials, grouped as in Slocum et al.</span></div>
          <div className="row-2">
            <table className="small" style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr><th style={{ textAlign: 'left' }}>trial type</th><th className="num">share</th><th className="num">this agent</th><th className="num">paper&apos;s best</th></tr></thead>
              <tbody>
                {categoryNames.map((nm, k) => (
                  <tr key={nm}>
                    <td>{['neither passing nor permanence', 'passing objects only', 'object permanence only', 'passing and permanence'][k]}</td>
                    <td className="num">{fmt((byCategory[k].n / tests.length) * 100, 0)}%</td>
                    <td className="num"><b>{fmt(byCategory[k].perf * 100, 1)}%</b></td>
                    <td className="num secondary">{paperBreakdown[k]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div>
              <div className="small secondary" style={{ marginBottom: 4 }}>Hardest trials for this agent (click to load):</div>
              <div className="inline small" style={{ flexWrap: 'wrap', gap: 4 }}>
                {worst.map((r, k) => (
                  <button key={k} className="chip" onClick={() => setTrial(r.trial)}>
                    {fmt(r.score * 100, 0)}% · {['plain', 'passing', 'permanence', 'both'][categoryIndex(r.category)]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="small muted">Passing objects: the object that starts farther away lands first, so the agent can&apos;t simply follow the nearest.
            Object permanence: when the first object is caught, the second is out of view, so the agent must remember where it went.</p>
        </div>

        {ex.circuitView && <AgentDynamicsCard view={ex.circuitView} rec={rec} idx={cur} onCircuit={(circuit) => ex.setState({ ...state, circuit })} />}

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[{ label: 'this trial', value: (p) => `${fmt((pinRecs[ex.pins.indexOf(p)]?.summary.score ?? NaN) * 100, 1)}%` }]} />

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<>
            <IntField label="interneurons (even)" value={ex.evoConfig.inter} min={0} max={12} onChange={(v) => ex.setEvoConfig({ ...ex.evoConfig, inter: v - (v % 2) })} />
            <IntField label="evaluation trials" value={ex.evoConfig.trials} min={1} max={200} onChange={(trials) => ex.setEvoConfig({ ...ex.evoConfig, trials })} />
            <IntField label="trial seed" value={ex.evoConfig.seed} min={1} max={1e6} onChange={(seed) => ex.setEvoConfig({ ...ex.evoConfig, seed })} />
            <p className="small muted">Bilaterally symmetric: 9 ray neurons, the chosen number of interneurons and 2 motor neurons, fully interconnected (the paper used 10
              interneurons, 146 genes; Goldenberg et al. found 2 can do as well). Fitness: (200 − mean of |miss₁| + |miss₂|) / 200. Slocum et al. ran 9000
              generations with shaping, which is far longer than a browser run.</p>
          </>} />
      </div>
    </div>
  );
}
