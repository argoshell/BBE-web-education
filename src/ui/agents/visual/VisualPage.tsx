// Explorer for the visual categorization agent (Beer 2003).

import { useMemo, useState } from 'react';
import { runAllTrials, visualAgent, type VisualState } from '../../../sim/agents/visual';
import { PhasePortrait, type PhaseOverlay } from '../../components/PhasePortrait';
import { TraceStack, type TraceRow } from '../../components/TraceStack';
import { Transport } from '../../components/Transport';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { fmt } from '../../plot';
import { neuronColor, useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';
import { VisualControls, VisualEvoConfigPanel } from './VisualControls';
import { TrialsOverview, VisualArena } from './VisualViews';

const agent = visualAgent;

function fromUrl(s: unknown): VisualState | null {
  if (!s || typeof s !== 'object' || !('circuit' in s)) return null;
  const d = agent.defaultParams();
  const v = s as VisualState;
  return { ...d, ...v, trial: { ...d.trial, ...v.trial }, trials: { ...d.trials, ...v.trials } };
}

const defaultAxes = (): [string, string] => ['o13', 'o14'];

function scores(s: VisualState) {
  const r = runAllTrials(s);
  const mean = (a: typeof r) => a.reduce((t, x) => t + x.score, 0) / Math.max(1, a.length);
  return { all: mean(r), circles: mean(r.filter((x) => x.shape === 'circle')), lines: mean(r.filter((x) => x.shape === 'line')) };
}

export function VisualPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, rec, cur, window } = ex;
  const [showSensors, setShowSensors] = useState(true);
  const [showStates, setShowStates] = useState(false);
  const [compareInPhase, setCompareInPhase] = useState(true);
  const results = useMemo(() => runAllTrials(state), [state]);

  const rows: TraceRow[] = useMemo(() => {
    const out: TraceRow[] = [];
    if (showSensors) for (let i = 1; i <= 7; i++) out.push({ key: `I${i}`, label: `S${i} in`, color: theme.text2, range: [0, 10] });
    for (let i = 8; i <= 14; i++) out.push({ key: `o${i}`, label: i <= 12 ? `N${i - 7}` : `M${i - 12}`, color: neuronColor(theme, i - 7), range: [0, 1] });
    if (showStates) for (let i = 8; i <= 14; i++) out.push({ key: `y${i}`, label: `${i <= 12 ? `N${i - 7}` : `M${i - 12}`} y`, color: neuronColor(theme, i - 7) });
    out.push({ key: 'relX', label: 'Δx', color: theme.text });
    return out;
  }, [theme, showSensors, showStates]);

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  // Compare pinned individuals on the trial currently shown
  const pinRecs = useMemo(() => ex.pins.map((p) => agent.simulate({ ...p.params, trial: state.trial })), [ex.pins, state.trial]);
  const pinScores = useMemo(() => ex.pins.map((p) => scores({ ...p.params, trials: state.trials, maxDistance: state.maxDistance })), [ex.pins, state.trials, state.maxDistance]);
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: pinRecs[k], color: pinColors[k], label: p.label }));

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => ex.resetTo(agent.defaultParams())}>Reset</button>
        </div>
        <VisualControls state={state} onChange={ex.setState} onPreset={ex.resetTo} />
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>Visual categorization</h2>
            <span className="muted small">{agent.citation}</span>
          </div>
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(rec.summary.finalDx, 1)}</span><span className="l">final Δx this trial</span></div>
            <div className="stat"><span className="v num">{fmt(rec.summary.score, 3)}</span><span className="l">trial score ({state.trial.shape === 'circle' ? 'catch' : 'avoid'})</span></div>
          </div>
          <VisualArena rec={rec} idx={cur} shape={state.trial.shape} size={state.trial.size} />
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
              <label className="chip"><input type="checkbox" checked={showSensors} onChange={(e) => setShowSensors(e.target.checked)} />sensor inputs</label>
              <label className="chip"><input type="checkbox" checked={showStates} onChange={(e) => setShowStates(e.target.checked)} />states</label>
            </div>
            <TraceStack rec={rec} rows={rows} idx={cur} onSeek={ex.setIdx} window={window} rowHeight={32} />
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
          <div className="card-head"><h2>All trials</h2><span className="muted small">{results.length} trials · {state.trials.count} per shape over ±{state.trials.range}</span></div>
          <TrialsOverview results={results} selected={state.trial} maxDistance={state.maxDistance}
            onSelect={(shape, offset) => { ex.setState({ ...state, trial: { ...state.trial, shape, offset, vy: state.trials.vy, size: state.trials.size } }); ex.setIdx(0); }} />
          <p className="small muted" style={{ marginTop: 6 }}>
            Beer/Setzler's <code>categorize.ns</code> reliably avoids lines but only partly approaches circles that start off-center;
            the evolved presets show the full behavior from Beer (2003): foveate, scan, then catch circles and avoid lines.
          </p>
        </div>

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[
            { label: 'fitness', value: (p) => fmt(pinScores[ex.pins.indexOf(p)]?.all ?? NaN, 3) },
            { label: 'circles', value: (p) => fmt(pinScores[ex.pins.indexOf(p)]?.circles ?? NaN, 3) },
            { label: 'lines', value: (p) => fmt(pinScores[ex.pins.indexOf(p)]?.lines ?? NaN, 3) },
            { label: 'final Δx (this trial)', value: (p) => fmt(pinRecs[ex.pins.indexOf(p)]?.summary.finalDx ?? NaN, 1) },
          ]} />

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<VisualEvoConfigPanel config={ex.evoConfig} onChange={ex.setEvoConfig} current={state} />} />
      </div>
    </div>
  );
}
