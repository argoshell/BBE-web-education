// Explorer for the visually guided tasks of Izquierdo, Beer & Setzler: object-size discrimination
// and perceiving affordances (passable apertures).

import { useMemo, useState } from 'react';
import {
  CIRCUITSIZE, guidedAgent, guidedColorSlot, guidedNeuronName, meanScore, NUMRAYS, runAllGuidedTrials, taskInfo, type GuidedState,
} from '../../../sim/agents/visual/guided';
import { BodySize } from '../../../sim/agents/visual/body';
import { PhasePortrait, type PhaseOverlay } from '../../components/PhasePortrait';
import { TraceStack, type TraceRow } from '../../components/TraceStack';
import { Transport } from '../../components/Transport';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { fmt } from '../../plot';
import { neuronColor, useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';
import { GuidedControls, GuidedEvoConfigPanel } from './GuidedControls';
import { GuidedArena, GuidedScoreMap, GuidedTrialsOverview } from './GuidedViews';

const agent = guidedAgent;

function fromUrl(s: unknown): GuidedState | null {
  if (!s || typeof s !== 'object' || !('circuit' in s) || !('sensorWeights' in s)) return null;
  const d = agent.defaultParams();
  const v = s as GuidedState;
  if (v.circuit.size !== CIRCUITSIZE) return null;
  return { ...d, ...v, trial: { ...d.trial, ...v.trial }, grid: { ...d.grid, ...v.grid } };
}

const defaultAxes = (): [string, string] => ['o8', 'o9'];

function bothScores(s: GuidedState) {
  return { size: meanScore(runAllGuidedTrials({ ...s, task: 'size' }, 1000)), aperture: meanScore(runAllGuidedTrials({ ...s, task: 'aperture' }, 1000)) };
}

export function GuidedPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, rec, cur, window } = ex;
  const [showInputs, setShowInputs] = useState(false);
  const [showStates, setShowStates] = useState(false);
  const [compareInPhase, setCompareInPhase] = useState(true);
  const results = useMemo(() => runAllGuidedTrials(state), [state]);
  const other = state.task === 'size' ? 'aperture' : 'size';
  const otherFitness = useMemo(() => meanScore(runAllGuidedTrials({ ...state, task: other }, 1000)), [state, other]);
  const info = taskInfo[state.task];

  const rows: TraceRow[] = useMemo(() => {
    const out: TraceRow[] = [];
    if (showInputs) for (let i = 1; i <= NUMRAYS; i++) out.push({ key: `in${i}`, label: `R${i}`, color: theme.text2, range: [0, 1] });
    for (let i = 0; i < CIRCUITSIZE; i++) out.push({ key: `o${i + 1}`, label: guidedNeuronName(i), color: neuronColor(theme, guidedColorSlot(i)), range: [0, 1] });
    if (showStates) for (let i = 0; i < CIRCUITSIZE; i++) out.push({ key: `y${i + 1}`, label: `${guidedNeuronName(i)} y`, color: neuronColor(theme, guidedColorSlot(i)) });
    out.push({ key: 'relX', label: 'Δx', color: theme.text });
    return out;
  }, [theme, showInputs, showStates]);

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const pinRecs = useMemo(() => ex.pins.map((p) => agent.simulate({ ...p.params, task: state.task, trial: state.trial })), [ex.pins, state.task, state.trial]);
  const pinScores = useMemo(() => ex.pins.map((p) => bothScores({ ...p.params, grid: state.grid, maxDistance: state.maxDistance })), [ex.pins, state.grid, state.maxDistance]);
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: pinRecs[k], color: pinColors[k], label: p.label }));
  const select = (pos: number, size: number) => { ex.setState({ ...state, trial: { pos, size } }); ex.setIdx(0); };
  const approach = (state.trial.size < BodySize) === (state.task === 'size');

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => ex.resetTo(agent.defaultParams())}>Reset</button>
        </div>
        <GuidedControls state={state} onChange={ex.setState} onPreset={ex.resetTo} />
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>{info.name}</h2>
            <div className="spacer" />
            <div className="inline">
              {(['size', 'aperture'] as const).map((t) => (
                <button key={t} className="tab" aria-current={state.task === t ? 'page' : undefined}
                  onClick={() => { ex.setState({ ...state, task: t }); ex.setIdx(0); }}>{taskInfo[t].name}</button>
              ))}
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>
            Tasks, agent and fitness from Eduardo Izquierdo&apos;s <a href="https://github.com/edizquierdo/VisuallyGuidedAgent" target="_blank" rel="noreferrer">VisuallyGuidedAgent</a>,
            made with Randall Beer and Matthew Setzler: 15 rays feed 7 interneurons that drive two motor neurons, with a
            left-right symmetric genome. {state.task === 'size'
              ? 'A circle 20–40 wide falls; the agent (30 wide) must catch circles smaller than itself and avoid larger ones.'
              : 'Two line segments fall together, leaving a gap 20–40 wide; the agent must pass through gaps wider than itself and avoid narrower ones.'}
          </p>
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(rec.summary.finalDistance, 1)}</span><span className="l">final distance this trial</span></div>
            <div className="stat"><span className="v num">{fmt(rec.summary.score, 3)}</span><span className="l">trial score ({approach ? (state.task === 'size' ? 'catch' : 'pass through') : 'avoid'})</span></div>
            <div className="stat"><span className="v num">{fmt(otherFitness, 3)}</span><span className="l">{taskInfo[other].name.toLowerCase()} fitness</span></div>
          </div>
          <GuidedArena rec={rec} idx={cur} task={state.task} pos={state.trial.pos} size={state.trial.size} />
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
              <label className="chip"><input type="checkbox" checked={showInputs} onChange={(e) => setShowInputs(e.target.checked)} />ray inputs</label>
              <label className="chip"><input type="checkbox" checked={showStates} onChange={(e) => setShowStates(e.target.checked)} />states</label>
            </div>
            <TraceStack rec={rec} rows={rows} idx={cur} onSeek={ex.setIdx} window={window} rowHeight={showInputs ? 22 : 30} />
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
          <div className="card-head"><h2>All trials</h2><span className="muted small">{results.length} distinct trials (each counted {state.grid.reps}× in the fitness, as in main.cpp)</span></div>
          <div className="row-2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
            <GuidedTrialsOverview results={results} task={state.task} selected={state.trial} maxDistance={state.maxDistance} onSelect={select} />
            <GuidedScoreMap results={results} task={state.task} selected={state.trial} onSelect={select} />
          </div>
        </div>

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[
            { label: 'size task', value: (p) => fmt(pinScores[ex.pins.indexOf(p)]?.size ?? NaN, 3) },
            { label: 'affordance task', value: (p) => fmt(pinScores[ex.pins.indexOf(p)]?.aperture ?? NaN, 3) },
            { label: 'final distance (this trial)', value: (p) => fmt(pinRecs[ex.pins.indexOf(p)]?.summary.finalDistance ?? NaN, 1) },
          ]} />

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<GuidedEvoConfigPanel config={ex.evoConfig} onChange={ex.setEvoConfig} />} />
      </div>
    </div>
  );
}
