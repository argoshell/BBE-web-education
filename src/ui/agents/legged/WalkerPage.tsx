// The walker explorer: body, neural traces, phase portrait, parameter editing,
// evolution and lineage, and comparison of pinned individuals.

import { useMemo, useState } from 'react';
import { leggedAgent, type WalkerState } from '../../../sim/agents/legged';
import { defaultBody } from '../../../sim/agents/legged/body';
import type { Recording } from '../../../sim/core/recording';
import { EquilibriumSweep } from '../../components/EquilibriumSweep';
import { DynamicsCard, type FamilyOption } from '../../components/DynamicsPanel';
import { rangeAround } from '../../../sim/core/circuitParams';
import { getParam, paramKeys, paramLabel, setParam } from '../../../sim/core/circuitParams';
import { PhasePortrait, type PhaseOverlay } from '../../components/PhasePortrait';
import { TraceStack, type TraceRow } from '../../components/TraceStack';
import { Transport } from '../../components/Transport';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { LaggedInfoCard } from '../../info/LaggedInfoPanel';
import { fmt } from '../../plot';
import { neuronColor, useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';
import { GaitRaster, WalkerBody } from './WalkerBody';
import { WalkerControls, WalkerEvoConfigPanel } from './WalkerControls';

const agent = leggedAgent;

function fromUrl(s: unknown): WalkerState | null {
  if (!s || typeof s !== 'object' || !('circuit' in s)) return null;
  const w = s as WalkerState;
  return { ...agent.defaultParams(), ...w, body: { ...defaultBody, ...w.body } };
}

function defaultAxes(s: WalkerState): [string, string] {
  if (s.controller === 'perfect' || s.circuit.size < 2) return ['angle', s.circuit.size >= 1 && s.controller !== 'perfect' ? 'o1' : 'omega'];
  return ['o1', 'o2'];
}

export function WalkerPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, rec, cur, window } = ex;
  const [showStates, setShowStates] = useState(false);
  const [showInputs, setShowInputs] = useState<boolean | null>(null);
  const [compareInPhase, setCompareInPhase] = useState(true);
  const inputsOn = showInputs ?? (state.controller === 'sensor' || state.controller === 'one');

  const rows: TraceRow[] = useMemo(() => {
    const out: TraceRow[] = [];
    const neurons = state.controller === 'perfect' ? 0 : state.circuit.size;
    for (let i = 1; i <= neurons; i++) out.push({ key: `o${i}`, label: `o${i}`, color: neuronColor(theme, i), range: [0, 1] });
    if (showStates) for (let i = 1; i <= neurons; i++) out.push({ key: `y${i}`, label: `y${i}`, color: neuronColor(theme, i) });
    if (inputsOn) for (let i = 1; i <= neurons; i++) out.push({ key: `I${i}`, label: `I${i}`, color: neuronColor(theme, i) });
    out.push({ key: 'angle', label: 'angle', color: theme.text2, range: [state.body.backwardAngleLimit * 1.15, state.body.forwardAngleLimit * 1.15] });
    out.push({ key: 'vx', label: 'velocity', color: theme.text2 });
    return out;
  }, [state, theme, showStates, inputsOn]);

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: p.rec, color: pinColors[k], label: p.label }));

  const sweep = useMemo(() => agent.inputSweep?.(state) ?? null, [state]);
  const fitness = rec.summary.avgVelocity;
  const nn = state.controller === 'perfect' ? 0 : state.circuit.size;
  const inputsNow = useMemo(() => Array.from({ length: nn }, (_, i) => rec.channels[`I${i + 1}`][cur]), [rec, nn, cur]);
  const yNow = useMemo(() => Array.from({ length: nn }, (_, i) => rec.channels[`y${i + 1}`][cur]), [rec, nn, cur]);
  const families: FamilyOption[] = useMemo(() => {
    if (nn === 0) return [];
    const c = state.circuit;
    const out: FamilyOption[] = [];
    if (sweep) out.push({ key: 'angle', label: 'leg angle (via the angle sensor)', value: rec.channels.angle[cur], range: sweep.range, family: { circuit: () => c, inputs: sweep.inputs } });
    for (const key of paramKeys(nn)) out.push({
      key, label: paramLabel(key), value: getParam(c, key), range: rangeAround(key, getParam(c, key)),
      family: { circuit: (l: number) => setParam(c, key, l), inputs: () => inputsNow },
      apply: (v: number) => ex.setState({ ...state, circuit: setParam(c, key, v) }),
    });
    return out;
  }, [state, nn, sweep, inputsNow, ex, rec, cur]);
  const perfectVel = useMemo(() => {
    const p = agent.presets[1].params();
    return agent.simulate({ ...p, body: state.body, run: state.run }).summary.avgVelocity;
  }, [state.body, state.run]);

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => ex.resetTo(agent.defaultParams())}>Reset</button>
        </div>
        <WalkerControls state={state} onChange={ex.setState} onPreset={ex.resetTo} />
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>One-legged walker</h2>
            <span className="muted small">{agent.citation}</span>
          </div>
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(fitness, 4)}</span><span className="l">average velocity (fitness)</span></div>
            <div className="stat"><span className="v num">{fmt(rec.summary.distance, 1)}</span><span className="l">distance in {fmt(state.run.duration, 0)} time units</span></div>
            <div className="stat"><span className="v num">{fmt((100 * fitness) / perfectVel, 1)}%</span><span className="l">of PerfectStep ({fmt(perfectVel, 4)})</span></div>
          </div>
          <WalkerBody rec={rec} idx={cur} body={state.body} />
          <div style={{ marginTop: 8 }}>
            <Transport t={rec.t} idx={cur} onSeek={ex.setIdx} playing={ex.playing} onPlaying={ex.setPlaying}
              speed={ex.speed} onSpeed={ex.setSpeed} window={window} onWindow={ex.setWin} />
          </div>
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-head">
              <h2>Neural &amp; body traces</h2>
              <div className="spacer" />
              <label className="chip"><input type="checkbox" checked={showStates} onChange={(e) => setShowStates(e.target.checked)} />neuron states</label>
              <label className="chip"><input type="checkbox" checked={inputsOn} onChange={(e) => setShowInputs(e.target.checked)} />inputs</label>
              <span className="chip"><span className="swatch" style={{ background: theme.stance, border: `1px solid ${theme.axis}` }} />stance</span>
            </div>
            <TraceStack rec={rec} rows={rows} idx={cur} onSeek={ex.setIdx} window={window} stanceKey="footState" />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Phase portrait</h2>
              <div className="spacer" />
              {ex.pins.length > 0 && <label className="chip"><input type="checkbox" checked={compareInPhase} onChange={(e) => setCompareInPhase(e.target.checked)} />show pinned</label>}
            </div>
            <PhasePortrait rec={rec} channels={ex.channels} circuitView={ex.circuitView} idx={cur} window={window}
              xKey={ex.axes[0]} yKey={ex.axes[1]} onAxes={(x, y) => ex.setAxes([x, y])} stanceKey="footState"
              overlays={compareInPhase ? overlays : []} />
          </div>
        </div>

        {sweep && ex.circuitView && (
          <div className="card">
            <div className="card-head"><h2>Equilibria vs. leg angle</h2><span className="muted small">how sensory feedback reshapes the circuit's dynamics</span></div>
            <EquilibriumSweep rec={rec} circuitView={ex.circuitView} sweep={sweep} idx={cur} window={window} />
          </div>
        )}

        {state.controller !== 'perfect' && (
          <LaggedInfoCard rec={rec} fromTime={Math.min(20, state.run.duration / 4)}
            description="Lagged mutual information between each neuron and the leg (angle, foot state, velocity) or another neuron, pooled over the run. Shows which neurons encode the leg's state and which anticipate it."
            channels={Array.from({ length: state.circuit.size }, (_, i) => ({ key: `o${i + 1}`, label: `o${i + 1}`, color: neuronColor(theme, i + 1) }))}
            targets={[
              { key: 'angle', label: 'leg angle' }, { key: 'footState', label: 'foot state (stance / swing)' }, { key: 'vx', label: 'body velocity' },
              ...Array.from({ length: state.circuit.size }, (_, i) => ({ key: `o${i + 1}`, label: `neuron o${i + 1}` })),
            ]} />
        )}

        {nn > 0 && (
          <DynamicsCard circuit={state.circuit} inputs={inputsNow} state={yNow} families={families}
            neuronName={(i) => `o${i + 1}`} neuronColor={(i) => neuronColor(theme, i + 1)}
            note={state.controller === 'sensor' || state.controller === 'one' ? 'Sensory inputs are frozen at their values at the current time; choose "leg angle" to see how the equilibria change as the leg moves.' : 'This controller gets no sensory input, so the circuit is an autonomous system: its limit cycle is the walking rhythm.'} />
        )}

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[
            { label: 'avg velocity', value: (p) => fmt(p.rec.summary.avgVelocity, 4) },
            { label: 'steps', value: (p) => String(countSteps(p.rec)) },
          ]}>
          <h3 style={{ marginBottom: 4 }}>Gait (foot down)</h3>
          <GaitRaster items={ex.pins.map((p, k) => ({ rec: p.rec, color: pinColors[k], label: p.label }))} window={window} />
        </CompareCard>

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<WalkerEvoConfigPanel config={ex.evoConfig} onChange={ex.setEvoConfig} current={state} />} />
      </div>
    </div>
  );
}

function countSteps(rec: Recording): number {
  const fs = rec.channels.footState;
  let c = 0;
  for (let k = 1; k < fs.length; k++) if (fs[k] === 1 && fs[k - 1] !== 1) c++;
  return c;
}
