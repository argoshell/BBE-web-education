// Explorer for the C. elegans klinotaxis model (Izquierdo & Lockery 2010; Izquierdo & Beer 2013).

import { useDeferredValue, useMemo, useState } from 'react';
import { chemotaxisAgent, neuronName, neuronSlot, refinedFitness, runAllTrials, trialSetFitness, wormRoles, type ChemoState } from '../../../sim/agents/chemotaxis';
import { PhasePortrait, type PhaseOverlay } from '../../components/PhasePortrait';
import { TraceStack, type TraceRow } from '../../components/TraceStack';
import { Transport } from '../../components/Transport';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { fmt } from '../../plot';
import { neuronColor, useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';
import { ChemoEvoConfigPanel, ChemotaxisControls } from './ChemotaxisControls';
import { ChemoArena, TrialsOverview, type ArenaZoom } from './ChemotaxisViews';

const agent = chemotaxisAgent;

function fromUrl(s: unknown): ChemoState | null {
  if (!s || typeof s !== 'object' || !('worm' in s)) return null;
  const d = agent.defaultParams(), v = s as ChemoState;
  if (!v.worm?.circuit) return null;
  return { ...d, ...v, trial: { ...d.trial, ...v.trial }, run: { ...d.run, ...v.run }, trials: { ...d.trials, ...v.trials } };
}

const defaultAxes = (s: ChemoState): [string, string] => {
  const r = wormRoles(s.worm.circuit.size);
  return [`o${r.SMBV + 1}`, `o${r.SMBD + 1}`];
};

export function ChemotaxisPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, rec, cur, window } = ex;
  const [showStates, setShowStates] = useState(false);
  const [zoom, setZoom] = useState<ArenaZoom>('dish');
  const [compareInPhase, setCompareInPhase] = useState(true);
  const [refined, setRefined] = useState<{ key: ChemoState; value: number } | null>(null);
  const n = state.worm.circuit.size;
  // The full evaluation is 8 long runs: compute it from a deferred copy so editing stays responsive
  const deferred = useDeferredValue(state);
  const results = useMemo(() => runAllTrials(deferred), [deferred]);
  const fitness = trialSetFitness(results);

  const rows: TraceRow[] = useMemo(() => {
    const roles = wormRoles(n);
    const color = (i: number) => (neuronSlot(i, n) > 0 ? neuronColor(theme, neuronSlot(i, n)) : theme.text2);
    const out: TraceRow[] = [
      { key: 'conc', label: 'conc.', color: theme.text2 },
      { key: 'on', label: 'ON', color: theme.text2 },
      { key: 'off', label: 'OFF', color: theme.text2 },
    ];
    const ids = [...roles.inter, roles.SMBV, roles.SMBD, ...(state.trial.mode === 'kinesis' ? [roles.F, roles.B] : [])];
    for (const i of ids) out.push({ key: `o${i + 1}`, label: neuronName(i, n), color: color(i), range: [0, 1] });
    if (showStates) for (const i of ids) out.push({ key: `y${i + 1}`, label: `${neuronName(i, n)} y`, color: color(i) });
    out.push({ key: 'turn', label: 'turn θ', color: theme.text });
    out.push({ key: 'bearing', label: 'bearing', color: theme.text, range: [-Math.PI, Math.PI] });
    out.push({ key: 'dist', label: 'dist.', color: theme.text });
    return out;
  }, [theme, n, showStates, state.trial.mode]);

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const pinRecs = useMemo(() => ex.pins.map((p) => agent.simulate({ ...p.params, trial: state.trial, run: state.run })), [ex.pins, state.trial, state.run]);
  const pinFits = useMemo(() => ex.pins.map((p) => trialSetFitness(runAllTrials({ ...p.params, trial: state.trial, trials: state.trials, run: state.run }))),
    [ex.pins, state.trial, state.trials, state.run]);
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: pinRecs[k], color: pinColors[k], label: p.label }));
  const refinedNow = refined && refined.key === state ? refined.value : null;

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => ex.resetTo(agent.defaultParams())}>Reset</button>
        </div>
        <ChemotaxisControls state={state} onChange={ex.setState} onPreset={ex.resetTo} />
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>C. elegans klinotaxis</h2>
            <span className="muted small">{agent.citation}</span>
          </div>
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(rec.summary.score, 4)}</span><span className="l">score this run</span></div>
            <div className="stat"><span className="v num">{fmt(rec.summary.meanDist, 3)}</span><span className="l">mean distance while scored (cm)</span></div>
            <div className="stat"><span className="v num">{fmt(fitness, 4)}</span><span className="l">fitness (all runs){deferred !== state ? ' …' : ''}</span></div>
            <div className="stat">
              <span className="v num">{refinedNow !== null ? fmt(refinedNow, 4) : '—'}</span>
              <span className="l">fitness at step ÷ 2 <button className="btn small" onClick={() => setRefined({ key: state, value: refinedFitness(state) })}>check</button></span>
            </div>
          </div>
          {refinedNow !== null && Math.abs(refinedNow - fitness) > 0.05 && (
            <p className="note" style={{ marginBottom: 8 }}>
              <b>⚠ Numerical artifact?</b> Fitness changes from {fmt(fitness, 3)} to {fmt(refinedNow, 3)} when the step size is halved.
            </p>
          )}
          <div className="inline" style={{ marginBottom: 6 }}>
            <span className="small secondary">view</span>
            <button className="tab" aria-selected={zoom === 'dish'} onClick={() => setZoom('dish')}>whole dish</button>
            <button className="tab" aria-selected={zoom === 'follow'} onClick={() => setZoom('follow')}>follow the head (7 mm)</button>
          </div>
          <ChemoArena rec={rec} idx={cur} zoom={zoom} />
          <div style={{ marginTop: 8 }}>
            <Transport t={rec.t} idx={cur} onSeek={ex.setIdx} playing={ex.playing} onPlaying={ex.setPlaying}
              speed={ex.speed} onSpeed={ex.setSpeed} window={window} onWindow={ex.setWin} />
          </div>
          <p className="small muted" style={{ marginTop: 6 }}>
            The head sweeps left and right (period 4.2 s) driven by an oscillator into the neck motor neurons SMBV/SMBD; the
            turning rate is their output difference. ON/OFF sensory cells report rises and falls of concentration, and the
            interneurons bias the sweeps so the worm curves up the gradient: klinotaxis. Use "follow the head" to see the sweeps.
          </p>
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-head">
              <h2>Neural traces</h2>
              <span className="muted small">shaded: scored part</span>
              <div className="spacer" />
              <label className="chip"><input type="checkbox" checked={showStates} onChange={(e) => setShowStates(e.target.checked)} />states</label>
            </div>
            <TraceStack rec={rec} rows={rows} idx={cur} onSeek={ex.setIdx} window={window} rowHeight={30} stanceKey="eval" />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Phase portrait</h2>
              <div className="spacer" />
              {ex.pins.length > 0 && <label className="chip"><input type="checkbox" checked={compareInPhase} onChange={(e) => setCompareInPhase(e.target.checked)} />show pinned</label>}
            </div>
            <PhasePortrait rec={rec} channels={ex.channels} circuitView={ex.circuitView} idx={cur} window={window}
              xKey={ex.axes[0]} yKey={ex.axes[1]} onAxes={(x, y) => ex.setAxes([x, y])} overlays={compareInPhase ? overlays : []} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>All runs of the evaluation</h2>
            <span className="muted small">{state.trials.orientations} headings × {state.trials.repeats} runs, as in main.cpp (one worm; its state carries over)</span></div>
          <TrialsOverview results={results} selected={state.trial}
            onSelect={(r) => { ex.setState({ ...state, trial: { ...state.trial, orient: r.orient, gradSteep: r.gradSteep } }); ex.setIdx(0); }} />
          <p className="small muted" style={{ marginTop: 6 }}>
            The explorer's single run starts with a fresh nervous system, so its score can differ slightly from the
            corresponding first run here (main.cpp reuses one worm for every heading).
          </p>
        </div>

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[
            { label: 'fitness', value: (p) => fmt(pinFits[ex.pins.indexOf(p)] ?? NaN, 4) },
            { label: 'score (this run)', value: (p) => fmt(pinRecs[ex.pins.indexOf(p)]?.summary.score ?? NaN, 4) },
            { label: 'mean distance', value: (p) => fmt(pinRecs[ex.pins.indexOf(p)]?.summary.meanDist ?? NaN, 3) },
          ]} />

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<ChemoEvoConfigPanel config={ex.evoConfig} onChange={ex.setEvoConfig} current={state} />} />
      </div>
    </div>
  );
}
