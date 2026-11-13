// Explorer for associative learning without synaptic plasticity (Izquierdo, Harvey & Beer 2008).

import { useDeferredValue, useMemo, useState } from 'react';
import {
  assumptions, forgettingCurve, learningAgent, learningFitness, learningMap, learningNeuronName, stages, strobes, TEMPS,
  type LearningRecording, type LearningState, type LearnMode, type StrobeKind,
} from '../../../sim/agents/learning';
import { RandomState } from '../../../sim/core/random';
import { AgentDynamicsCard } from '../../components/AgentDynamicsCard';
import { CheckField, IntField, NumberField, SelectField } from '../../components/controls';
import { EquilibriumSweep } from '../../components/EquilibriumSweep';
import { Heatmap } from '../../components/Heatmap';
import { LineChart } from '../../components/LineChart';
import { PhasePortrait, type PhaseOverlay } from '../../components/PhasePortrait';
import { Scatter } from '../../components/Scatter';
import { TraceStack, type TraceRow } from '../../components/TraceStack';
import { Transport } from '../../components/Transport';
import { WeightMatrix } from '../../components/WeightMatrix';
import { EvolutionPanel } from '../../evolution/EvolutionPanel';
import { fmt } from '../../plot';
import { neuronColor, useTheme } from '../../theme';
import { CompareCard, LoadedBanner } from '../common';
import { useExplorer } from '../useExplorer';

const agent = learningAgent;

function fromUrl(s: unknown): LearningState | null {
  if (!s || typeof s !== 'object' || !('circuit' in s) || !('tw' in s)) return null;
  const d = agent.defaultParams(), v = s as LearningState;
  return { ...d, ...v, sequence: { ...d.sequence, ...v.sequence } };
}

const defaultAxes = (s: LearningState): [string, string] => (s.circuit.size >= 2 ? ['y1', 'y2'] : ['y1', 'o1']);
const strobeKinds: StrobeKind[] = ['pairing', 'delay', 'test', 'reward+', 'reward−'];

export function LearningPage() {
  const theme = useTheme();
  const ex = useExplorer(agent, { fromUrl, defaultAxes });
  const { state, cur, window } = ex;
  const rec = ex.rec as LearningRecording;
  const n = state.circuit.size;
  const tests = rec.tests ?? [];
  const deferred = useDeferredValue(state);
  const [showNeurons, setShowNeurons] = useState(true);
  const [strobeAxes, setStrobeAxes] = useState<[number, number]>([0, 1]);
  const [strobeColor, setStrobeColor] = useState<'phase' | 'pairing'>('phase');

  const stage4 = useMemo(() => learningFitness(deferred, deferred.mode, stages[3], 100, deferred.dt, new RandomState(7)), [deferred]);
  const map = useMemo(() => learningMap(deferred, 21, deferred.dt), [deferred]);
  const forgetting = useMemo(() => forgettingCurve(deferred, deferred.mode, 12, 120, deferred.dt), [deferred]);
  const strobeData = useMemo(() => strobes(deferred, deferred.mode, 60, deferred.dt), [deferred]);
  const sweep = useMemo(() => agent.inputSweep?.(state) ?? null, [state]);

  const stimRows: TraceRow[] = useMemo(() => [
    { key: 'T', label: 'T (temp.)', color: theme.series[0], range: [0, 2.1] },
    { key: 'F', label: 'F (food)', color: theme.series[1], range: [-1.1, 1.1] },
    { key: 'mouth', label: 'mouth M', color: theme.text, range: [0, 1] },
    { key: 'target', label: 'correct action', color: theme.series[2], range: [0, 1], step: true },
  ], [theme]);
  const neuronRows: TraceRow[] = useMemo(() => Array.from({ length: n }, (_, i) => ({
    key: `o${i + 1}`, label: `${learningNeuronName(i)} output`, color: neuronColor(theme, i + 1), range: [0, 1] as [number, number],
  })), [theme, n]);

  const pinColors = [theme.series[0], theme.series[1], theme.series[2]];
  const pinRecs = useMemo(() => ex.pins.map((p) => agent.simulate({ ...p.params, sequence: state.sequence, mode: state.mode })), [ex.pins, state.sequence, state.mode]);
  const overlays: PhaseOverlay[] = ex.pins.map((p, k) => ({ rec: pinRecs[k], color: pinColors[k], label: p.label }));

  const setNode = (i: number, key: 'taus' | 'biases', v: number) => {
    const arr = state.circuit[key].slice(); arr[i] = v;
    ex.setState({ ...state, circuit: { ...state.circuit, [key]: arr } });
  };
  const setSensor = (i: number, key: 'tw' | 'fw', v: number) => { const arr = state[key].slice(); arr[i] = v; ex.setState({ ...state, [key]: arr }); };
  const seek = (t: number) => ex.setIdx(Math.max(0, Math.min(rec.t.length - 1, Math.round(t / state.dt))));

  const strobeGroups = useMemo(() => {
    const [a, b] = strobeAxes;
    if (strobeColor === 'phase')
      return strobeKinds.map((k, j) => {
        const pts = strobeData.filter((s) => s.kind === k);
        return { label: k, color: theme.series[j], x: pts.map((s) => s.state[a] ?? 0), y: pts.map((s) => s.state[b] ?? 0) };
      });
    // Colored by the paired temperature (cold / mid / hot thirds)
    const bands = [['cold pairing (1–1.33)', 1, 4 / 3], ['middle (1.33–1.67)', 4 / 3, 5 / 3], ['hot pairing (1.67–2)', 5 / 3, 2.01]] as const;
    return bands.map(([label, lo, hi], j) => {
      const pts = strobeData.filter((s) => s.pair >= lo && s.pair < hi);
      return { label, color: theme.series[[0, 6, 1][j]], x: pts.map((s) => s.state[a] ?? 0), y: pts.map((s) => s.state[b] ?? 0) };
    });
  }, [strobeData, strobeAxes, strobeColor, theme]);

  const neuronOptions = Array.from({ length: n }, (_, i) => ({ value: String(i), label: learningNeuronName(i) }));
  const sc = { fitness: rec.summary.fitness, accuracy: rec.summary.accuracy };

  return (
    <div className="page">
      <aside className="card sidebar">
        <div className="card-head"><h2>Parameters</h2><div className="spacer" />
          <button className="btn small" onClick={() => ex.resetTo(agent.defaultParams())}>Reset</button>
        </div>
        <details className="section" open>
          <summary>Task</summary>
          <div className="section-body">
            <SelectField label="preset" value="" onChange={(v) => { const p = agent.presets[Number(v)]; if (p) { ex.resetTo(p.params()); ex.setIdx(0); } }}
              options={[{ value: '', label: 'Load a preset…' }, ...agent.presets.map((p, i) => ({ value: String(i), label: p.name }))]} />
            <SelectField<LearnMode> label="temperatures" value={state.mode} onChange={(mode) => ex.setState({ ...state, mode })}
              options={[{ value: 'continuum', label: 'continuum [1, 2]' }, { value: 'discrete', label: 'discrete {1, 2}' }]} />
          </div>
        </details>
        <details className="section" open>
          <summary>Lifetime shown</summary>
          <div className="section-body">
            <IntField label="environments (L)" value={state.sequence.L} min={1} max={8} onChange={(L) => ex.setState({ ...state, sequence: { ...state.sequence, L } })} />
            <IntField label="min tests per env." value={state.sequence.K[0]} min={0} max={10} onChange={(k) => ex.setState({ ...state, sequence: { ...state.sequence, K: [k, Math.max(k, state.sequence.K[1])] } })} />
            <IntField label="max tests per env." value={state.sequence.K[1]} min={0} max={10} onChange={(k) => ex.setState({ ...state, sequence: { ...state.sequence, K: [Math.min(k, state.sequence.K[0]), k] } })} />
            <IntField label="random seed" value={state.sequence.seed} min={1} max={1e6} onChange={(seed) => ex.setState({ ...state, sequence: { ...state.sequence, seed } })} />
            <button className="btn small" onClick={() => { ex.setState({ ...state, sequence: { ...state.sequence, seed: Math.floor(Math.random() * 1e6) + 1 } }); ex.setIdx(0); }}>New random lifetime</button>
          </div>
        </details>
        <details className="section">
          <summary>Neurons</summary>
          <div className="section-body">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${neuronColor(theme, i + 1)}`, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div className="small secondary">{learningNeuronName(i)}{i === 0 ? ' (mouth)' : ''}</div>
                <NumberField label="τ (tau)" value={state.circuit.taus[i]} min={1} max={150} step={0.01} onChange={(v) => setNode(i, 'taus', Math.max(1e-3, v))} />
                <NumberField label="θ (bias)" value={state.circuit.biases[i]} min={-10} max={10} step={0.01} onChange={(v) => setNode(i, 'biases', v)} />
                <NumberField label="T weight" value={state.tw[i]} min={-10} max={10} step={0.01} onChange={(v) => setSensor(i, 'tw', v)} />
                <NumberField label="F weight" value={state.fw[i]} min={-10} max={10} step={0.01} onChange={(v) => setSensor(i, 'fw', v)} />
              </div>
            ))}
          </div>
        </details>
        <details className="section">
          <summary>Connection weights</summary>
          <div className="section-body">
            <WeightMatrix size={n} weights={state.circuit.weights} range={10} onChange={(weights) => ex.setState({ ...state, circuit: { ...state.circuit, weights } })} />
            <p className="small muted">Rows: from M, o2, …. Gains are 1: outputs are σ(y + θ).</p>
          </div>
        </details>
      </aside>

      <div className="main-col">
        <div className="card">
          <div className="card-head">
            <h2>Associative learning without synaptic plasticity</h2>
            <span className="muted small">{agent.citation}</span>
          </div>
          <p className="small secondary" style={{ marginBottom: 8 }}>
            Food arrives together with a temperature (<b>pairing</b>). Later a temperature is presented alone (<b>test</b>), and the agent must open its
            mouth if it is the paired temperature and keep it closed otherwise. Then it gets a reward (food) or a punishment. The environment can
            change: a new pairing means food now comes at another temperature. The weights never change during a lifetime, so whatever is learned is held
            in the circuit&apos;s state. {state.mode === 'continuum' ? 'Here the temperatures can take any value in [1, 2].' : 'Here there are just two temperatures, 1 and 2.'}
          </p>
          <details className="small" style={{ marginBottom: 8 }}>
            <summary>What the paper leaves open, and how this port fills it</summary>
            <ul>{assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
            <p>Checked against the paper&apos;s two evolved circuits: the 5-node circuit reproduces the learning map of Figure 10a (open only on the
              paired temperature), and the 3-node circuit scores above 98% on the discrete task (paper: 99.99%). On long lifetimes with many switches
              the 5-node circuit is correct on about 88% of tests here, against 95.8% in the paper, which suggests the reward signal differs in some detail.</p>
          </details>
          <LoadedBanner loaded={ex.loaded} onPin={ex.pin} onRevert={ex.selectIndividual} />
          <div className="stats" style={{ marginBottom: 8 }}>
            <div className="stat"><span className="v num">{fmt(sc.accuracy * 100, 0)}%</span><span className="l">tests answered correctly ({rec.summary.tests})</span></div>
            <div className="stat"><span className="v num">{fmt(sc.fitness, 3)}</span><span className="l">fitness of this lifetime</span></div>
            <div className="stat"><span className="v num">{fmt(stage4, 3)}</span><span className="l">fitness on 100 random lifetimes (stage 4: 3 environments, 0–5 tests)</span></div>
          </div>
          <TraceStack rec={rec} rows={showNeurons ? [...stimRows, ...neuronRows] : stimRows} idx={cur} onSeek={ex.setIdx} window={window} stanceKey="evalWin" rowHeight={30} />
          <div className="inline small" style={{ flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
            <span className="muted">Shaded: evaluation windows. Tests:</span>
            {tests.map((t, k) => (
              <button key={k} className="chip" onClick={() => seek(t.t0)} title={`environment ${t.env + 1}, test ${t.index + 1}: paired ${fmt(t.pair, 2)}, tested ${fmt(t.temp, 2)}, error ${fmt(t.error, 3)}${t.counts ? '' : ' (too close to count)'}`}
                style={{ opacity: t.counts ? 1 : 0.55 }}>
                {t.correct ? '✓' : '✗'} {fmt(t.pair, 2)}→{fmt(t.temp, 2)} {t.same ? 'open' : 'close'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <CheckField label="neuron outputs" value={showNeurons} onChange={setShowNeurons} />
          </div>
          <Transport t={rec.t} idx={cur} onSeek={ex.setIdx} playing={ex.playing} onPlaying={ex.setPlaying}
            speed={ex.speed} onSpeed={ex.setSpeed} window={window} onWindow={ex.setWin} />
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-head"><h2>Learning map</h2><span className="muted small">mouth on the first test after a pairing</span></div>
            <Heatmap values={map} xRange={TEMPS} yRange={TEMPS} xLabel="test temperature" yLabel="paired temperature" valueLabel="mean mouth output" />
            <p className="small muted">Paper Figure 10a. A perfect learner is open (dark) only on the diagonal: it opens for the temperature it was paired with and stays closed for every other.</p>
          </div>
          <div className="card">
            <div className="card-head"><h2>Forgetting curve</h2><span className="muted small">correct answers on the k-th test after one pairing</span></div>
            <LineChart x={Float64Array.from(forgetting, (_, k) => k + 1)} series={[{ label: 'fraction correct', values: forgetting, color: theme.series[0] }]}
              yRange={[0, 1]} xLabel="test number" height={240} />
            <p className="small muted">Paper Figure 10d. Each test is followed by a reward or punishment. The memory sits in the circuit&apos;s slow state, so it can drift over many tests.</p>
          </div>
        </div>

        <div className="row-2">
          <div className="card">
            <div className="card-head"><h2>Phase portrait</h2></div>
            <PhasePortrait rec={rec} channels={ex.channels} circuitView={ex.circuitView} idx={cur} window={window}
              xKey={ex.axes[0]} yKey={ex.axes[1]} onAxes={(x, y) => ex.setAxes([x, y])} overlays={overlays} />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Strobed states</h2>
              <div className="spacer" />
              <SelectField label="x" value={String(strobeAxes[0])} options={neuronOptions} onChange={(v) => setStrobeAxes([Number(v), strobeAxes[1]])} />
              <SelectField label="y" value={String(strobeAxes[1])} options={neuronOptions} onChange={(v) => setStrobeAxes([strobeAxes[0], Number(v)])} />
              <SelectField<'phase' | 'pairing'> label="color by" value={strobeColor} onChange={setStrobeColor}
                options={[{ value: 'phase', label: 'phase' }, { value: 'pairing', label: 'paired temperature' }]} />
            </div>
            <Scatter groups={strobeGroups} xLabel={`${learningNeuronName(strobeAxes[0])} state`} yLabel={`${learningNeuronName(strobeAxes[1])} state`} height={280} />
            <p className="small muted">
              Paper Figures 5 and 13: the state at the end of every pairing, delay, test signal and reward over 60 random lifetimes. For the discrete
              learner these fall into separate clusters, the states of a finite-state machine. For the continuum learner they stretch into continuous bands
              ordered by the paired temperature.
            </p>
          </div>
        </div>

        {sweep && ex.circuitView && (
          <div className="card">
            <div className="card-head"><h2>Equilibria vs. temperature</h2><span className="muted small">the circuit&apos;s fixed points with a constant temperature and no food</span></div>
            <EquilibriumSweep rec={rec} circuitView={ex.circuitView} sweep={sweep} idx={cur} window={window} />
          </div>
        )}

        {ex.circuitView && <AgentDynamicsCard view={ex.circuitView} rec={rec} idx={cur} onCircuit={(circuit) => ex.setState({ ...state, circuit })} />}

        <CompareCard agent={agent} ctl={ex.ctl} pins={ex.pins} colors={pinColors} onSelect={ex.selectIndividual}
          onUnpin={ex.unpin} onClear={() => ex.setPins([])}
          columns={[{ label: 'correct (this lifetime)', value: (p) => `${fmt((pinRecs[ex.pins.indexOf(p)]?.summary.accuracy ?? NaN) * 100, 0)}%` }]} />

        <EvolutionPanel agent={agent} evoConfig={ex.evoConfig} selectedId={ex.selectedId} onSelect={ex.selectIndividual} onPin={ex.pin}
          agentConfig={<>
            <SelectField<LearnMode> label="temperatures" value={ex.evoConfig.mode} onChange={(mode) => ex.setEvoConfig({ ...ex.evoConfig, mode })}
              options={[{ value: 'continuum', label: 'continuum [1, 2]' }, { value: 'discrete', label: 'discrete {1, 2}' }]} />
            <IntField label="nodes" value={ex.evoConfig.size} min={1} max={8} onChange={(size) => ex.setEvoConfig({ ...ex.evoConfig, size })} />
            <SelectField label="shaping stage" value={String(ex.evoConfig.stage)} onChange={(v) => ex.setEvoConfig({ ...ex.evoConfig, stage: Number(v) })}
              options={stages.map((s, i) => ({ value: String(i + 1), label: `${i + 1}: ${s.L} env., ${s.K[0] === s.K[1] ? s.K[0] : `${s.K[0]}–${s.K[1]}`} tests` }))} />
            <IntField label="lifetimes per evaluation" value={ex.evoConfig.sequences} min={1} max={200} onChange={(sequences) => ex.setEvoConfig({ ...ex.evoConfig, sequences })} />
            <p className="small muted">
              Fitness is one minus the mean weighted error over all tests (paper eq. 2). Each evaluation draws fresh random lifetimes, so fitness is noisy.
              The paper starts at stage 1 and moves up a stage once the best agent exceeds 95% (discrete) or 90% (continuum); here you pick the stage and
              can raise it during a run. Genome: N² + 4N genes. Weights, biases and sensor weights lie in [−10, 10]; time constants are in [1, e⁵], mapped exponentially.
            </p>
          </>} />
      </div>
    </div>
  );
}
