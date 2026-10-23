// A bodiless CTRNN evolved to oscillate: a central pattern generator on its own
// (Beer 1995; Mathayomchan & Beer 2002). The default circuit is the 2-neuron oscillator
// from SimpleCTRNNMain.cpp.

import type { AgentModule } from '../../agent';
import { findEquilibria } from '../../analysis/equilibria';
import { cycleStats, MIN_AMPLITUDE, totalVariation } from '../../analysis/oscillation';
import { CTRNN, type CTRNNParams } from '../../core/ctrnn';
import { RandomState } from '../../core/random';
import { Recorder, type ChannelSpec, type Recording } from '../../core/recording';
import { mapSearchParameter } from '../../core/tsearch';
import evolvedPresets from './evolvedPresets.json';

export type Integrator = 'euler' | 'rk4';
export type FitnessKind = 'change' | 'period';

export interface OscRun {
  duration: number;
  dt: number;
  integrator: Integrator;
  /** Time ignored before measuring (lets the circuit settle onto its attractor). */
  transient: number;
  /** Initial states are uniform in [-initRange, initRange] (SimpleCTRNNMain uses 0.5). */
  initRange: number;
  seed: number;
}

export interface OscFitness {
  kind: FitnessKind;
  /** Target period for the 'period' fitness. */
  targetPeriod: number;
}

export interface OscState {
  circuit: CTRNNParams;
  /** Biases follow the center-crossing condition theta_i = -sum_j w_ji / 2. */
  centerCrossing: boolean;
  run: OscRun;
  fitness: OscFitness;
}

export interface OscRanges {
  tau: [number, number];
  bias: [number, number];
  weight: [number, number];
  gain?: [number, number];
}

export interface OscEvoConfig {
  size: number;
  centerCrossing: boolean;
  ranges: OscRanges;
  run: OscRun;
  fitness: OscFitness;
}

export const defaultOscRanges: OscRanges = { tau: [1, 10], bias: [-16, 16], weight: [-16, 16] };

/** The oscillator from SimpleCTRNNMain.cpp. */
export const simpleOscillator: CTRNNParams = {
  size: 2, taus: [1, 1], biases: [-2.75, -1.75], gains: [1, 1], weights: [4.5, -1, 1, 4.5],
};

export function centerCrossingBiases(c: CTRNNParams): number[] {
  const n = c.size;
  return Array.from({ length: n }, (_, i) => {
    let s = 0;
    for (let j = 0; j < n; j++) s += c.weights[j * n + i];
    return -s / 2;
  });
}

/** The circuit actually simulated (applies center-crossing if enabled). */
export function effectiveCircuit(s: Pick<OscState, 'circuit' | 'centerCrossing'>): CTRNNParams {
  return s.centerCrossing ? { ...s.circuit, biases: centerCrossingBiases(s.circuit) } : s.circuit;
}

/**
 * Run the circuit. Like SimpleCTRNNMain, the initial state is randomized and then the circuit is
 * integrated for floor(duration / dt) steps. Sample 0 is the initial state.
 */
export function runCircuit(c: CTRNNParams, run: OscRun, onSample?: (t: number, ns: CTRNN) => void): void {
  const ns = CTRNN.fromParams(c);
  ns.randomizeCircuitState(-run.initRange, run.initRange, new RandomState(run.seed));
  onSample?.(0, ns);
  const steps = Math.round(run.duration / run.dt);
  for (let k = 1; k <= steps; k++) {
    if (run.integrator === 'rk4') ns.rk4Step(run.dt); else ns.eulerStep(run.dt);
    onSample?.(k * run.dt, ns);
  }
}

/** Collect outputs only (fast path for fitness and parameter maps). */
export function runOutputs(c: CTRNNParams, run: OscRun): { t: Float64Array; outputs: Float64Array[] } {
  const steps = Math.round(run.duration / run.dt);
  const t = new Float64Array(steps + 1);
  const outputs = Array.from({ length: c.size }, () => new Float64Array(steps + 1));
  let k = 0;
  runCircuit(c, run, (time, ns) => {
    t[k] = time;
    for (let i = 0; i < c.size; i++) outputs[i][k] = ns.outputs[i];
    k++;
  });
  return { t, outputs };
}

export function transientIndex(run: OscRun): number {
  return Math.min(Math.round(run.duration / run.dt), Math.max(0, Math.round(run.transient / run.dt)));
}

/**
 * Fitness of a run.
 *  - change: mean over neurons of the average |d output| per unit time after the transient.
 *  - period: mean amplitude, weighted by how close the period of neuron 1 is to the target
 *    (Gaussian in log-period with sigma 0.1, i.e. about 10%).
 */
export function oscFitness(t: Float64Array, outputs: Float64Array[], run: OscRun, f: OscFitness): number {
  const from = transientIndex(run);
  if (outputs.length === 0) return 0;
  if (f.kind === 'change') return outputs.reduce((s, o) => s + totalVariation(t, o, from), 0) / outputs.length;
  const stats = outputs.map((o) => cycleStats(t, o, from));
  const p = stats[0].period;
  if (!Number.isFinite(p) || stats[0].amplitude < MIN_AMPLITUDE) return 0;
  const amp = stats.reduce((s, c) => s + c.amplitude, 0) / stats.length;
  const d = Math.log(p / f.targetPeriod);
  return amp * Math.exp(-(d * d) / (2 * 0.1 * 0.1));
}

/** Fitness re-run with RK4 at a fifth of the step size, to detect numerical artifacts. */
export function refinedFitness(s: OscState): number {
  const run: OscRun = { ...s.run, dt: s.run.dt / 5, integrator: 'rk4' };
  const { t, outputs } = runOutputs(effectiveCircuit(s), run);
  return oscFitness(t, outputs, run, s.fitness);
}

export function simulateOsc(s: OscState): Recording {
  const c = effectiveCircuit(s), n = c.size;
  const keys: string[] = [];
  for (let i = 1; i <= n; i++) keys.push(`o${i}`, `y${i}`, `I${i}`);
  const rec = new Recorder(keys);
  runCircuit(c, s.run, (time, ns) => {
    const v: Record<string, number> = {};
    for (let i = 0; i < n; i++) { v[`o${i + 1}`] = ns.outputs[i]; v[`y${i + 1}`] = ns.states[i]; v[`I${i + 1}`] = 0; }
    rec.push(time, v);
  });
  const r = rec.finish();
  const outs = Array.from({ length: n }, (_, i) => r.channels[`o${i + 1}`]);
  r.summary.fitness = oscFitness(r.t, outs, s.run, s.fitness);
  return r;
}

// ------------------------------------------------------------------ genome

/** Genome layout: taus[N], biases[N] (unless center-crossing), gains[N] (optional), weights[N*N]. */
export function oscGenomeSize(e: OscEvoConfig): number {
  const n = e.size;
  return n + (e.centerCrossing ? 0 : n) + (e.ranges.gain ? n : 0) + n * n;
}

export function decodeOsc(g: ArrayLike<number>, e: OscEvoConfig): CTRNNParams {
  const n = e.size, r = e.ranges;
  let k = 0;
  const next = (range: [number, number]) => mapSearchParameter(g[k++], range[0], range[1]);
  const taus = Array.from({ length: n }, () => next(r.tau));
  const biases = e.centerCrossing ? new Array(n).fill(0) : Array.from({ length: n }, () => next(r.bias));
  const gains = r.gain ? Array.from({ length: n }, () => next(r.gain!)) : new Array(n).fill(1);
  const weights = Array.from({ length: n * n }, () => next(r.weight));
  const c = { size: n, taus, biases, gains, weights };
  return e.centerCrossing ? { ...c, biases: centerCrossingBiases(c) } : c;
}

// ------------------------------------------------------------------ parameter-space maps

/** A single circuit parameter, addressed as 'tau:i', 'bias:i', 'gain:i' or 'w:i:j' (0-based). */
export type ParamKey = string;

export function paramLabel(key: ParamKey): string {
  const [kind, a, b] = key.split(':').map((s, i) => (i ? Number(s) + 1 : s));
  if (kind === 'w') return `w${a}→${b}`;
  return `${{ tau: 'τ', bias: 'θ', gain: 'g' }[kind as 'tau' | 'bias' | 'gain']}${a}`;
}

export function getParam(c: CTRNNParams, key: ParamKey): number {
  const [kind, a, b] = key.split(':');
  const i = Number(a);
  if (kind === 'tau') return c.taus[i];
  if (kind === 'bias') return c.biases[i];
  if (kind === 'gain') return c.gains[i];
  return c.weights[i * c.size + Number(b)];
}

export function setParam(c: CTRNNParams, key: ParamKey, v: number): CTRNNParams {
  const [kind, a, b] = key.split(':');
  const i = Number(a);
  if (kind === 'tau') { const taus = c.taus.slice(); taus[i] = v; return { ...c, taus }; }
  if (kind === 'bias') { const biases = c.biases.slice(); biases[i] = v; return { ...c, biases }; }
  if (kind === 'gain') { const gains = c.gains.slice(); gains[i] = v; return { ...c, gains }; }
  const weights = c.weights.slice();
  weights[i * c.size + Number(b)] = v;
  return { ...c, weights };
}

export function paramKeys(n: number): ParamKey[] {
  const out: ParamKey[] = [];
  for (let i = 0; i < n; i++) out.push(`bias:${i}`);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push(`w:${i}:${j}`);
  for (let i = 0; i < n; i++) out.push(`tau:${i}`);
  for (let i = 0; i < n; i++) out.push(`gain:${i}`);
  return out;
}

export type MapMetric = 'amplitude' | 'period' | 'stable';

export interface MapCell {
  amplitude: number;
  period: number;
  stable: number;
}

/** Behavior of the circuit with two parameters set to (x, y). Bias axes override center-crossing. */
export function mapCell(s: OscState, xKey: ParamKey, x: number, yKey: ParamKey, y: number, metric: MapMetric): MapCell {
  let c = effectiveCircuit(s);
  c = setParam(setParam(c, xKey, x), yKey, y);
  if (metric === 'stable') {
    const eqs = findEquilibria(c, new Array(c.size).fill(0), [], 12, 1);
    return { amplitude: NaN, period: NaN, stable: eqs.filter((e) => e.stable).length };
  }
  // A shorter, coarser run is enough to classify behavior
  const run: OscRun = { ...s.run, dt: Math.max(s.run.dt, 0.05), duration: Math.min(s.run.duration, s.run.transient + 100) };
  const { t, outputs } = runOutputs(c, run);
  const from = transientIndex(run);
  const stats = outputs.map((o) => cycleStats(t, o, from));
  const amplitude = stats.reduce((m, st) => Math.max(m, st.amplitude), 0);
  return { amplitude, period: amplitude >= MIN_AMPLITUDE ? stats[0].period : NaN, stable: NaN };
}

// ------------------------------------------------------------------ module

const defaultRun: OscRun = { duration: 250, dt: 0.01, integrator: 'euler', transient: 50, initRange: 0.5, seed: 1 };

export const oscillatorAgent: AgentModule<OscState, OscEvoConfig> = {
  id: 'oscillator',
  name: 'CTRNN oscillator',
  citation: 'Bodiless central pattern generator (Beer 1995; Mathayomchan & Beer 2002). Default circuit from SimpleCTRNNMain.cpp.',

  defaultParams: () => ({
    circuit: structuredClone(simpleOscillator),
    centerCrossing: false,
    run: { ...defaultRun },
    fitness: { kind: 'change', targetPeriod: 10 },
  }),

  presets: [
    {
      name: 'SimpleCTRNNMain 2-neuron oscillator',
      description: 'The example circuit shipped with EvolutionaryAgents.',
      params: () => oscillatorAgent.defaultParams(),
    },
    ...(evolvedPresets as { name: string; seed: number; fitness: number; state: OscState }[]).map((p) => ({
      name: `${p.name} (${p.fitness.toFixed(3)})`,
      description: `Evolved by this site's TSearch port, seed ${p.seed}.`,
      params: (): OscState => structuredClone(p.state),
    })),
  ],

  simulate: simulateOsc,

  channels: (s) => {
    const n = s.circuit.size, out: ChannelSpec[] = [];
    for (let i = 1; i <= n; i++) out.push({ key: `o${i}`, label: `o${i} (output)`, group: 'Neuron outputs', range: [0, 1] });
    for (let i = 1; i <= n; i++) out.push({ key: `y${i}`, label: `y${i} (state)`, group: 'Neuron states' });
    return out;
  },

  circuitView: (s) => ({ circuit: effectiveCircuit(s), outputKey: (i) => `o${i + 1}`, stateKey: (i) => `y${i + 1}`, inputKey: (i) => `I${i + 1}` }),

  defaultEvoConfig: (s) => ({
    size: s.circuit.size,
    centerCrossing: s.centerCrossing,
    ranges: { ...defaultOscRanges },
    // Same step size and integrator as the explorer: coarse Euler steps let evolution exploit
    // numerical oscillations that vanish at finer resolution.
    run: { ...s.run, duration: Math.min(s.run.duration, 150) },
    fitness: { ...s.fitness },
  }),
  genomeSize: oscGenomeSize,
  decode: (g, e) => ({ circuit: decodeOsc(g, e), centerCrossing: e.centerCrossing, run: { ...e.run }, fitness: { ...e.fitness } }),
  evaluate: (g, e) => {
    const { t, outputs } = runOutputs(decodeOsc(g, e), e.run);
    return oscFitness(t, outputs, e.run, e.fitness);
  },
  genomeLabels: (e) => {
    const n = e.size, out: string[] = [];
    for (let i = 1; i <= n; i++) out.push(`τ${i}`);
    if (!e.centerCrossing) for (let i = 1; i <= n; i++) out.push(`θ${i}`);
    if (e.ranges.gain) for (let i = 1; i <= n; i++) out.push(`g${i}`);
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) out.push(`w${i}→${j}`);
    return out;
  },
};
