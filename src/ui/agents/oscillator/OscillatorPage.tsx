// Explorer for a bodiless CTRNN oscillator (central pattern generator).

import { useMemo, useState } from 'react';
import { cycleStats } from '../../../sim/analysis/oscillation';
import { oscillatorAgent, refinedFitness, setParam, transientIndex, type OscState } from '../../../sim/agents/oscillator';
import { PhasePortrait, type PhaseOverlay } from '../../components/PhasePortrait';
import { TraceStack, type TraceRow } from '../../components/TraceStack';
import { Transport } from '../../components/Transport';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { fmt } from '../../plot';
import { neuronColor, useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';
import { OscControls, OscEvoConfigPanel } from './OscControls';
import { CycleTable, ParamMap, SpectrumChart } from './OscViews';

const agent = oscillatorAgent;

function fromUrl(s: unknown): OscState | null {
  if (!s || typeof s !== 'object' || !('circuit' in s)) return null;
  const d = agent.defaultParams(), v = s as OscState;
  return { ...d, ...v, run: { ...d.run, ...v.run }, fitness: { ...d.fitness, ...v.fitness } };
}

const defaultAxes = (s: OscState): [string, string] => (s.circuit.size >= 2 ? ['o1', 'o2'] : ['y1', 'o1']);

export function OscillatorPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, rec, cur, window } = ex;
  const [showStates, setShowStates] = useState(false);
  const [compareInPhase, setCompareInPhase] = useState(true);
  const n = state.circuit.size;

  const rows: TraceRow[] = useMemo(() => {
    const out: TraceRow[] = [];
    for (let i = 1; i <= n; i++) out.push({ key: `o${i}`, label: `o${i}`, color: neuronColor(theme, i), range: [0, 1] });
    if (showStates) for (let i = 1; i <= n; i++) out.push({ key: `y${i}`, label: `y${i}`, color: neuronColor(theme, i) });
    return out;
  }, [n, theme, showStates]);

  const stats1 = useMemo(() => cycleStats(rec.t, rec.channels.o1, transientIndex(state.run)), [rec, state.run]);
  const refined = useMemo(() => refinedFitness(state), [state]);
  const fit = rec.summary.fitness;
  const artifact = Math.abs(refined - fit) > 0.1 * Math.max(Math.abs(fit), 1e-3);
  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: p.rec, color: pinColors[k], label: p.label }));

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => ex.resetTo(agent.defaultParams())}>Reset</button>
        </div>
        <OscControls state={state} onChange={ex.setState} onPreset={ex.resetTo} />
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>CTRNN oscillator</h2>
            <span className="muted small">{agent.citation}</span>
          </div>
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(rec.summary.fitness, 4)}</span><span className="l">fitness ({state.fitness.kind === 'change' ? 'total output change' : `target period ${state.fitness.targetPeriod}`})</span></div>
            <div className="stat"><span className="v num">{Number.isFinite(stats1.period) ? fmt(stats1.period, 3) : '—'}</span><span className="l">period (n1)</span></div>
            <div className="stat"><span className="v num">{fmt(stats1.amplitude, 3)}</span><span className="l">amplitude (n1)</span></div>
            <div className="stat"><span className="v num">{fmt(refined, 4)}</span><span className="l">fitness check (RK4, step ÷ 5)</span></div>
          </div>
          {artifact && (
            <p className="note" style={{ marginBottom: 8 }}>
              <b>⚠ Numerical artifact?</b> Fitness changes a lot with a finer RK4 integration ({fmt(fit, 3)} → {fmt(refined, 3)}). The behavior may come from
              integration error at step size {state.run.dt} rather than from the circuit. Try a smaller step or the RK4 integrator.
            </p>
          )}
          <CycleTable rec={rec} state={state} />
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
              <label className="chip"><input type="checkbox" checked={showStates} onChange={(e) => setShowStates(e.target.checked)} />neuron states</label>
            </div>
            <TraceStack rec={rec} rows={rows} idx={cur} onSeek={ex.setIdx} window={window} />
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

        <div className="row-2">
          <div className="card">
            <div className="card-head"><h2>Parameter-space map</h2><span className="muted small">behavior as two parameters vary</span></div>
            <ParamMap state={state} onPick={(xk, x, yk, y) => {
              const fromCC = state.centerCrossing && (xk.startsWith('bias') || yk.startsWith('bias'));
              const base = fromCC ? { ...state.circuit, biases: agent.circuitView(state)!.circuit.biases } : state.circuit;
              ex.setState({ ...state, centerCrossing: fromCC ? false : state.centerCrossing, circuit: setParam(setParam(base, xk, x), yk, y) });
            }} />
          </div>
          <div className="card">
            <div className="card-head"><h2>Frequency spectrum</h2></div>
            <SpectrumChart rec={rec} state={state} />
          </div>
        </div>

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[
            { label: 'fitness', value: (p) => fmt(p.rec.summary.fitness, 4) },
            { label: 'period (n1)', value: (p) => { const s = cycleStats(p.rec.t, p.rec.channels.o1, transientIndex(p.params.run)); return Number.isFinite(s.period) ? fmt(s.period, 3) : '—'; } },
          ]} />

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<OscEvoConfigPanel config={ex.evoConfig} onChange={ex.setEvoConfig} current={state} />} />
      </div>
    </div>
  );
}
