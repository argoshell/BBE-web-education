// The walker explorer: body, neural traces, phase portrait, parameter editing,
// evolution and lineage, and comparison of pinned individuals.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { leggedAgent, type WalkerEvoConfig, type WalkerState } from '../../../sim/agents/legged';
import { defaultBody } from '../../../sim/agents/legged/body';
import type { Recording } from '../../../sim/core/recording';
import { PhasePortrait, type PhaseOverlay } from '../../components/PhasePortrait';
import { TraceStack, type TraceRow } from '../../components/TraceStack';
import { Transport } from '../../components/Transport';
import { EvolutionPanel, useEvolution } from '../../evolution/EvolutionPanel';
import { GenomeDiff } from '../../evolution/views';
import { fmt } from '../../plot';
import { neuronColor, useTheme } from '../../theme';
import { parseHash, writeHash } from '../../urlState';
import { GaitRaster, WalkerBody } from './WalkerBody';
import { WalkerControls, WalkerEvoConfigPanel } from './WalkerControls';

const agent = leggedAgent;

interface Loaded {
  id: number;
  born: number;
  perf: number;
  modified: boolean;
}

interface Pin {
  id: number;
  label: string;
  params: WalkerState;
  rec: Recording;
}

function initialState(): WalkerState {
  const { page, state } = parseHash();
  if (page === 'walker' && state && typeof state === 'object' && 'circuit' in state) {
    const s = state as WalkerState;
    return { ...agent.defaultParams(), ...s, body: { ...defaultBody, ...s.body } };
  }
  return agent.defaultParams();
}

function defaultAxes(s: WalkerState): [string, string] {
  if (s.controller === 'perfect' || s.circuit.size < 2) return ['angle', s.circuit.size >= 1 && s.controller !== 'perfect' ? 'o1' : 'omega'];
  return ['o1', 'o2'];
}

export function WalkerPage() {
  const theme = useTheme();
  const [state, setStateRaw] = useState<WalkerState>(initialState);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  const [win, setWin] = useState<[number, number]>([0, Infinity]);
  const [axes, setAxes] = useState<[string, string]>(() => defaultAxes(state));
  const [showStates, setShowStates] = useState(false);
  const [evoConfig, setEvoConfig] = useState<WalkerEvoConfig>(() => agent.defaultEvoConfig(state));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const { ctl } = useEvolution(agent.id);

  const setState = useCallback((s: WalkerState) => {
    setStateRaw(s);
    setLoaded((l) => (l ? { ...l, modified: true } : l));
  }, []);

  useEffect(() => writeHash('walker', state), [state]);

  const rec = useMemo(() => agent.simulate(state), [state]);
  const channels = useMemo(() => agent.channels(state), [state]);
  const circuitView = useMemo(() => agent.circuitView(state), [state]);
  const n = rec.t.length;
  const window: [number, number] = [Math.min(win[0], n - 2), Math.min(win[1], n - 1)];
  const cur = Math.min(idx, n - 1);

  // Keep phase axes valid when the circuit changes
  useEffect(() => {
    const keys = new Set(channels.map((c) => c.key));
    if (!keys.has(axes[0]) || !keys.has(axes[1])) setAxes(defaultAxes(state));
  }, [channels, axes, state]);

  const rows: TraceRow[] = useMemo(() => {
    const out: TraceRow[] = [];
    const neurons = state.controller === 'perfect' ? 0 : state.circuit.size;
    for (let i = 1; i <= neurons; i++) out.push({ key: `o${i}`, label: `o${i}`, color: neuronColor(theme, i), range: [0, 1] });
    if (showStates) for (let i = 1; i <= neurons; i++) out.push({ key: `y${i}`, label: `y${i}`, color: neuronColor(theme, i) });
    out.push({ key: 'angle', label: 'angle', color: theme.text2, range: [state.body.backwardAngleLimit * 1.15, state.body.forwardAngleLimit * 1.15] });
    out.push({ key: 'vx', label: 'velocity', color: theme.text2 });
    return out;
  }, [state, theme, showStates]);

  const selectIndividual = useCallback((id: number) => {
    const run = ctl.run;
    const a = run?.archive.get(id);
    if (!run || !a) return;
    setSelectedId(id);
    setStateRaw(agent.decode(a.genome, run.evoConfig as WalkerEvoConfig));
    setLoaded({ id, born: a.born, perf: a.perf, modified: false });
  }, [ctl]);

  const pin = useCallback((id: number) => {
    const run = ctl.run;
    const a = run?.archive.get(id);
    if (!run || !a) return;
    setPins((ps) => {
      if (ps.some((p) => p.id === id)) return ps;
      const params = agent.decode(a.genome, run.evoConfig as WalkerEvoConfig);
      const next = [...ps, { id, label: `#${id} (gen ${a.born})`, params, rec: agent.simulate(params) }];
      return next.slice(-3);
    });
  }, [ctl]);

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const overlays: PhaseOverlay[] = pins.map((p, k) => ({ rec: p.rec, color: pinColors[k], label: p.label }));
  const [compareInPhase, setCompareInPhase] = useState(true);

  const fitness = rec.summary.avgVelocity;
  const perfect = useMemo(() => agent.presets[1].params(), []);
  const perfectVel = useMemo(() => agent.simulate({ ...perfect, body: state.body, run: state.run }).summary.avgVelocity, [perfect, state.body, state.run]);

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => { setStateRaw(agent.defaultParams()); setLoaded(null); setSelectedId(null); }}>Reset</button>
        </div>
        <WalkerControls state={state} onChange={setState} />
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>One-legged walker</h2>
            <span className="muted small">{agent.citation}</span>
          </div>
          {loaded && (
            <div className="note inline" style={{ marginBottom: 8 }}>
              Viewing evolved individual <b>#{loaded.id}</b> (born generation {loaded.born}, fitness {fmt(loaded.perf, 4)})
              {loaded.modified && <span> · <b>modified</b> since loading</span>}
              <div className="spacer" style={{ flex: 1 }} />
              <button className="btn small" onClick={() => pin(loaded.id)}>Pin to compare</button>
              {loaded.modified && <button className="btn small" onClick={() => selectIndividual(loaded.id)}>Revert</button>}
            </div>
          )}
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(fitness, 4)}</span><span className="l">average velocity (fitness)</span></div>
            <div className="stat"><span className="v num">{fmt(rec.summary.distance, 1)}</span><span className="l">distance in {fmt(state.run.duration, 0)} time units</span></div>
            <div className="stat"><span className="v num">{fmt((100 * fitness) / perfectVel, 1)}%</span><span className="l">of PerfectStep ({fmt(perfectVel, 4)})</span></div>
          </div>
          <WalkerBody rec={rec} idx={cur} body={state.body} />
          <div style={{ marginTop: 8 }}>
            <Transport t={rec.t} idx={cur} onSeek={setIdx} playing={playing} onPlaying={setPlaying}
              speed={speed} onSpeed={setSpeed} window={window} onWindow={setWin} />
          </div>
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-head">
              <h2>Neural &amp; body traces</h2>
              <div className="spacer" />
              <label className="chip"><input type="checkbox" checked={showStates} onChange={(e) => setShowStates(e.target.checked)} />neuron states</label>
              <span className="chip"><span className="swatch" style={{ background: theme.stance, border: `1px solid ${theme.axis}` }} />stance</span>
            </div>
            <TraceStack rec={rec} rows={rows} idx={cur} onSeek={setIdx} window={window} stanceKey="footState" />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Phase portrait</h2>
              <div className="spacer" />
              {pins.length > 0 && <label className="chip"><input type="checkbox" checked={compareInPhase} onChange={(e) => setCompareInPhase(e.target.checked)} />show pinned</label>}
            </div>
            <PhasePortrait rec={rec} channels={channels} circuitView={circuitView} idx={cur} window={window}
              xKey={axes[0]} yKey={axes[1]} onAxes={(x, y) => setAxes([x, y])} stanceKey="footState"
              overlays={compareInPhase ? overlays : []} />
          </div>
        </div>

        {pins.length > 0 && (
          <div className="card">
            <div className="card-head">
              <h2>Compare pinned individuals</h2>
              <span className="muted small">up to 3</span>
              <div className="spacer" />
              <button className="btn small" onClick={() => setPins([])}>Clear</button>
            </div>
            <table className="data" style={{ marginBottom: 8 }}>
              <thead><tr><th>individual</th><th className="num">avg velocity</th><th className="num">steps</th><th></th></tr></thead>
              <tbody>
                {pins.map((p, k) => (
                  <tr key={p.id} className="clickable" onClick={() => selectIndividual(p.id)}>
                    <td><span className="swatch" style={{ background: pinColors[k], marginRight: 6 }} />{p.label}</td>
                    <td className="num">{fmt(p.rec.summary.avgVelocity, 4)}</td>
                    <td className="num">{countSteps(p.rec)}</td>
                    <td><button className="btn small" onClick={(e) => { e.stopPropagation(); setPins((ps) => ps.filter((q) => q.id !== p.id)); }}>unpin</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 style={{ marginBottom: 4 }}>Gait (foot down)</h3>
            <GaitRaster items={pins.map((p, k) => ({ rec: p.rec, color: pinColors[k], label: p.label }))} window={window} />
            <h3 style={{ margin: '10px 0 4px' }}>Genome differences</h3>
            {ctl.run && <GenomeDiff labels={agent.genomeLabels(ctl.run.evoConfig as WalkerEvoConfig)}
              items={pins.flatMap((p, k) => { const a = ctl.run!.archive.get(p.id); return a ? [{ label: p.label, color: pinColors[k], rec: a }] : []; })} />}
          </div>
        )}

        <EvolutionPanel agent={agent} evoConfig={evoConfig} selectedId={selectedId} onSelect={selectIndividual} onPin={pin}
          agentConfig={<WalkerEvoConfigPanel config={evoConfig} onChange={setEvoConfig} current={state} />} />
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
