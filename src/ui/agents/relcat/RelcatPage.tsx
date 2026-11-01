// Explorer for relational categorization (Williams, Beer & Gasser 2008; Beer & Williams 2015).

import { useDeferredValue, useMemo, useState } from 'react';
import { relcatAgent, relcatEnsemble, relcatNeuronName, runAllRelcatTrials, type RelcatState } from '../../../sim/agents/relcat';
import { trialSizes } from '../../../sim/agents/relcat/body';
import { AgentDynamicsCard } from '../../components/AgentDynamicsCard';
import { CheckField, NumberField, SelectField } from '../../components/controls';
import { PhasePortrait, type PhaseOverlay } from '../../components/PhasePortrait';
import { TraceStack, type TraceRow } from '../../components/TraceStack';
import { Transport } from '../../components/Transport';
import { WeightMatrix } from '../../components/WeightMatrix';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { InfoPanel } from '../../info/InfoPanel';
import { fmt } from '../../plot';
import { neuronColor, useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';
import { RelcatArena, RelcatOverview, RelcatScoreMatrix } from './RelcatViews';

const agent = relcatAgent;

function fromUrl(s: unknown): RelcatState | null {
  if (!s || typeof s !== 'object' || !('net' in s)) return null;
  const d = agent.defaultParams(), v = s as RelcatState;
  return { ...d, ...v, params: { ...d.params, ...v.params }, trial: { ...d.trial, ...v.trial } };
}

const defaultAxes = (s: RelcatState): [string, string] => [`o${s.net.size - 1}`, `o${s.net.size}`];

export function RelcatPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, rec, cur, window } = ex;
  const n = state.net.size;
  const [showRays, setShowRays] = useState(false);
  const results = useMemo(() => runAllRelcatTrials(state), [state]);
  const [infoOpen, setInfoOpen] = useState(false);
  const deferred = useDeferredValue(state);
  const ensemble = useMemo(() => (infoOpen ? relcatEnsemble(deferred, trialSizes(deferred.params)) : null), [infoOpen, deferred]);

  const rows: TraceRow[] = useMemo(() => {
    const out: TraceRow[] = [];
    if (showRays) for (let r = 1; r <= state.params.numRays; r++) out.push({ key: `s${r}`, label: `ray ${r}`, color: theme.text2, range: [0, 1] });
    for (let i = 1; i <= n; i++) out.push({ key: `o${i}`, label: relcatNeuronName(i - 1, n), color: neuronColor(theme, i), range: [0, 1] });
    out.push({ key: 'relX', label: 'Δx', color: theme.text });
    return out;
  }, [theme, showRays, n, state.params.numRays]);

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const pinRecs = useMemo(() => ex.pins.map((p) => agent.simulate({ ...p.params, trial: state.trial })), [ex.pins, state.trial]);
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: pinRecs[k], color: pinColors[k], label: p.label }));
  const select = (first: number, second: number) => { ex.setState({ ...state, trial: { first, second } }); ex.setIdx(0); };
  const catchTrial = state.trial.first > state.trial.second;
  const setNet = (patch: Partial<RelcatState['net']>) => ex.setState({ ...state, net: { ...state.net, ...patch } });

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => ex.resetTo(agent.defaultParams())}>Reset</button>
        </div>
        <details className="section" open>
          <summary>Trial</summary>
          <div className="section-body">
            <SelectField label="preset" value="" onChange={(v) => { const p = agent.presets[Number(v)]; if (p) ex.resetTo(p.params()); }}
              options={[{ value: '', label: agent.presets.length ? 'Load a preset…' : 'No presets yet' }, ...agent.presets.map((p, i) => ({ value: String(i), label: p.name }))]} />
            <NumberField label="first size" value={state.trial.first} min={20} max={65} step={1} onChange={(v) => ex.setState({ ...state, trial: { ...state.trial, first: v } })} />
            <NumberField label="second size" value={state.trial.second} min={20} max={65} step={1} onChange={(v) => ex.setState({ ...state, trial: { ...state.trial, second: v } })} />
            <p className="note">{catchTrial ? 'Second circle is smaller: the agent should catch it.' : state.trial.first < state.trial.second ? 'Second circle is larger: the agent should avoid it.' : 'Equal sizes: not part of the task.'}</p>
          </div>
        </details>
        <details className="section" open>
          <summary>Neurons</summary>
          <div className="section-body">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${neuronColor(theme, i + 1)}`, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div className="small secondary">{relcatNeuronName(i, n)}{i >= n - 2 ? ' (motor)' : ' (interneuron)'}</div>
                <NumberField label="τ (tau)" value={state.net.taus[i]} min={1} max={30} step={0.01} onChange={(v) => { const t = state.net.taus.slice(); t[i] = Math.max(1e-3, v); setNet({ taus: t }); }} />
                <NumberField label="θ (bias)" value={state.net.biases[i]} min={-16} max={16} step={0.01} onChange={(v) => { const b = state.net.biases.slice(); b[i] = v; setNet({ biases: b }); }} />
              </div>
            ))}
          </div>
        </details>
        <details className="section">
          <summary>Connection weights</summary>
          <div className="section-body">
            <WeightMatrix size={n} weights={state.net.weights} range={16} onChange={(weights) => setNet({ weights })} />
            <p className="small muted">Rows: from N1.., ML, MR. Neuron outputs are σ(g·y + θ), as in relcat.</p>
          </div>
        </details>
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>Relational categorization</h2>
            <span className="muted small">{agent.citation}</span>
          </div>
          <p className="small secondary" style={{ marginBottom: 8 }}>
            A circle falls while the agent is held still; then a second circle falls and the agent may move. It must <b>catch</b> the second circle
            if it is smaller than the first and <b>avoid</b> it if it is larger, so it has to remember the first size and compare.
            Ported from <a href="https://github.com/Nathaniel-Rodriguez/relcat" target="_blank" rel="noreferrer">relcat</a> (N. Rodriguez), checked step by step against it.
          </p>
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(rec.summary.finalDx, 1)}</span><span className="l">final Δx this trial</span></div>
            <div className="stat"><span className="v num">{fmt(rec.summary.score, 3)}</span><span className="l">trial score ({catchTrial ? 'catch' : 'avoid'})</span></div>
          </div>
          <RelcatArena rec={rec} idx={cur} p={state.params} first={state.trial.first} />
          <div style={{ marginTop: 8 }}>
            <Transport t={rec.t} idx={cur} onSeek={ex.setIdx} playing={ex.playing} onPlaying={ex.setPlaying}
              speed={ex.speed} onSpeed={ex.setSpeed} window={window} onWindow={ex.setWin} />
          </div>
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-head">
              <h2>Neural traces</h2>
              <div className="spacer" />
              <CheckField label="ray inputs" value={showRays} onChange={setShowRays} />
            </div>
            <TraceStack rec={rec} rows={rows} idx={cur} onSeek={ex.setIdx} window={window} rowHeight={32} />
          </div>
          <div className="card">
            <div className="card-head"><h2>Phase portrait</h2></div>
            <PhasePortrait rec={rec} channels={ex.channels} circuitView={ex.circuitView} idx={cur} window={window}
              xKey={ex.axes[0]} yKey={ex.axes[1]} onAxes={(x, y) => ex.setAxes([x, y])} overlays={overlays} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>All trials</h2><span className="muted small">{results.length} trials (relcat&apos;s size grid, 20–65)</span></div>
          <div className="row-2">
            <RelcatOverview results={results} selected={state.trial} onSelect={select} />
            <div>
              <h3 style={{ marginBottom: 6 }}>Score per size pair</h3>
              <RelcatScoreMatrix results={results} selected={state.trial} onSelect={select} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Information</h2>
            <span className="muted small">how information about the first size and the relation flows through the circuit (Beer &amp; Williams 2015)</span>
            <div className="spacer" />
            <button className="btn small" onClick={() => setInfoOpen(!infoOpen)}>{infoOpen ? 'Hide' : 'Analyze'}</button>
          </div>
          {!infoOpen || !ensemble ? (
            <p className="small muted">
              Runs every trial of the size grid and measures, at each moment, how much each neuron knows about the first circle&apos;s size, the second&apos;s,
              and the relation between them. Time is aligned on fall progress: 0–1 is phase 1, 1–2 is phase 2. Information about the first size should
              appear in phase 1 and be held into phase 2, where information about the relation (and so the decision) appears.
            </p>
          ) : (
            <InfoPanel ensemble={ensemble} colorOf={(key) => (key === 'relX' ? undefined : neuronColor(theme, Number(key.slice(1))))}
              defaultPair={[`o1`, `o${n - 1}`]} />
          )}
        </div>

        {ex.circuitView && <AgentDynamicsCard view={ex.circuitView} rec={rec} idx={cur}
          onCircuit={(c) => ex.setState({ ...state, net: { ...state.net, weights: c.weights, taus: c.taus, biases: c.biases.map((b, i) => b * state.net.gains[i]) } })} />}

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[{ label: 'final Δx (this trial)', value: (p) => fmt(pinRecs[ex.pins.indexOf(p)]?.summary.finalDx ?? NaN, 1) }]} />

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<>
            <CheckField label="bilaterally symmetric genome" value={ex.evoConfig.symmetric} onChange={(v) => ex.setEvoConfig({ ...ex.evoConfig, symmetric: v })} />
            {ex.evoConfig.symmetric && <p className="note">Caution: relcat drops every circle straight above the agent, so a perfectly symmetric circuit can only avoid by breaking symmetry through floating-point rounding. Its behavior then depends on arithmetic details rather than on the circuit, so prefer the unconstrained genome.</p>}
            <p className="small muted">Fitness as in relcat: over all size pairs, 1 − d when the second circle is smaller (catch) and d when larger (avoid), d = final horizontal distance / 75, combined by relcat&apos;s row/column averaging. One evaluation runs 90 trials (≈ 50 ms).</p>
          </>} />
      </div>
    </div>
  );
}
