// Associative learning without synaptic plasticity: the temperature-preference task of
// Izquierdo, Harvey & Beer (2008), "Associative learning on a continuum in evolved dynamical
// neural networks", Adaptive Behavior 16(6):361-384. No code was published, so this follows the
// paper; details it leaves open are listed in `assumptions` (shown on the page) and were checked
// against the evolved circuits printed in its appendix (Tables A1, A2), which are the presets.
//
// A fully connected CTRNN (gains 1) senses temperature T and food/reward F through extra weights:
//   τ_i y_i' = −y_i + Σ_j w_ji σ(y_j + θ_j) + tw_i T + fw_i F.
// Node 1 is the mouth: σ(y_1 + θ_1). Within a trial (a "lifetime") the state is never reset.

import type { AgentModule } from '../../agent';
import { CTRNN, type CTRNNParams } from '../../core/ctrnn';
import { RandomState } from '../../core/random';
import { Recorder, type ChannelSpec, type Recording } from '../../core/recording';
import { mapSearchParameter } from '../../core/tsearch';

export type LearnMode = 'discrete' | 'continuum';

/** Phase lengths (paper §2.2). Durations given as ranges are drawn uniformly per phase. */
export const PAIR_DURATION = 20;
export const PAIR_DELAY: [number, number] = [16, 24];
export const TEST_DURATION = 10;
export const EVAL_DURATION = 10;
export const WAIT: [number, number] = [8, 12];
/** Assumed: the reward is the food signal (+1 after a correct action, −1 after a wrong one) for 10 time units. */
export const REWARD_DURATION = 10;
export const REWARD = { positive: 1, negative: -1 };
/** Tests closer than this to the paired temperature (but not equal) don't count (continuum task). */
export const IGNORE_WITHIN = 0.1;
export const TEMPS: [number, number] = [1, 2];

/** Shaping stages of §2.6: L environments, K tests per environment (drawn from [K0, K1]). */
export interface Stage { L: number; K: [number, number] }
export const stages: Stage[] = [{ L: 1, K: [1, 1] }, { L: 1, K: [3, 3] }, { L: 2, K: [3, 3] }, { L: 3, K: [0, 5] }];

export const assumptions = [
  'The reward is the food input: F = +1 after a correct action and F = −1 after a wrong one, for 10 time units. The paper says only that a positive or negative reward is applied.',
  'An action counts as correct (for the reward and the accuracy) when its weighted error on that test is below 0.5.',
  'In the discrete task a "different" test uses the other temperature. In the continuum task it is drawn uniformly from [1, 2].',
  'Evolution uses this site\'s TSearch (rank selection, elitism), not the paper\'s microbial GA with demes, and it evaluates each genome on freshly drawn random sequences.',
];

/** Gaussian weighting of the evaluation window (§2.5), normalized so a test's error lies in [0, 1]. */
export function evalWeight(u: number): number {
  return Math.exp(-((u - 5) ** 2) / 5.12) / 4.0034;
}

export interface LearningController {
  /** The CTRNN (gains are always 1). */
  circuit: CTRNNParams;
  /** Weights from the temperature sensor and from the food/reward sensor to each node. */
  tw: number[];
  fw: number[];
}

export interface SequenceSpec { seed: number; L: number; K: [number, number] }

export interface LearningState extends LearningController {
  mode: LearnMode;
  sequence: SequenceSpec;
  dt: number;
}

// ------------------------------------------------------------------ sequences

export interface TestPlan { temp: number; wait1: number; wait2: number }
export interface EnvPlan { pair: number; delay: number; tests: TestPlan[] }

function drawTemp(rs: RandomState, mode: LearnMode): number {
  return mode === 'continuum' ? rs.uniformRandom(TEMPS[0], TEMPS[1]) : rs.uniformRandom(0, 1) < 0.5 ? TEMPS[0] : TEMPS[1];
}

/** Draw a sequence of L environments (pairings), each followed by K tests. */
export function drawSequence(rs: RandomState, mode: LearnMode, L: number, K: [number, number]): EnvPlan[] {
  const out: EnvPlan[] = [];
  for (let l = 0; l < L; l++) {
    const pair = drawTemp(rs, mode);
    const delay = rs.uniformRandom(PAIR_DELAY[0], PAIR_DELAY[1]);
    const k = K[0] === K[1] ? K[0] : rs.uniformRandomInteger(K[0], K[1]);
    const tests: TestPlan[] = [];
    for (let j = 0; j < k; j++) {
      const same = rs.uniformRandom(0, 1) < 0.5;
      const temp = same ? pair : mode === 'discrete' ? TEMPS[0] + TEMPS[1] - pair : rs.uniformRandom(TEMPS[0], TEMPS[1]);
      tests.push({ temp, wait1: rs.uniformRandom(WAIT[0], WAIT[1]), wait2: rs.uniformRandom(WAIT[0], WAIT[1]) });
    }
    out.push({ pair, delay, tests });
  }
  return out;
}

// ------------------------------------------------------------------ simulation

export type Phase = 'pair' | 'delay' | 'test' | 'eval' | 'wait' | 'reward' | 'rest';
export const phaseNames: Phase[] = ['pair', 'delay', 'test', 'eval', 'wait', 'reward', 'rest'];

export interface TestResult {
  /** Time the test temperature is applied. */
  t0: number;
  env: number;
  index: number;
  pair: number;
  temp: number;
  same: boolean;
  /** Counts toward fitness (not a near-miss in the continuum task). */
  counts: boolean;
  error: number;
  correct: boolean;
}

export interface StepInfo { T: number; F: number; phase: Phase; target: number; env: number }
type StepHook = (ns: CTRNN, t: number, info: StepInfo) => void;

export function makeNetwork(c: LearningController): CTRNN {
  return CTRNN.fromParams(c.circuit);
}

/** Run one lifetime from rest. Returns every test with its weighted error. */
export function runSequence(c: LearningController, plan: EnvPlan[], dt: number, onStep?: StepHook, ns = makeNetwork(c)): TestResult[] {
  const n = c.circuit.size;
  ns.randomizeCircuitState(0, 0, new RandomState(1));
  let time = 0;
  const info: StepInfo = { T: 0, F: 0, phase: 'rest', target: NaN, env: 0 };
  onStep?.(ns, 0, info);
  /** Same loop shape as the C++ integrators: `for (t = 0; t < d; t += dt)`. */
  const run = (d: number, T: number, F: number, phase: Phase, target: number, each?: (u: number) => void) => {
    info.T = T; info.F = F; info.phase = phase; info.target = target;
    for (let i = 0; i < n; i++) ns.externalInputs[i] = c.tw[i] * T + c.fw[i] * F;
    for (let u = 0; u < d - 1e-9; u += dt) {
      ns.eulerStep(dt);
      time += dt;
      each?.(u + dt);
      onStep?.(ns, time, info);
    }
  };
  const tests: TestResult[] = [];
  plan.forEach((env, l) => {
    info.env = l;
    run(PAIR_DURATION, env.pair, 1, 'pair', NaN);
    run(env.delay, 0, 0, 'delay', NaN);
    env.tests.forEach((tp, k) => {
      const same = tp.temp === env.pair;
      const t0 = time;
      run(TEST_DURATION, tp.temp, 0, 'test', NaN);
      const want = same ? 1 : 0;
      let error = 0;
      run(EVAL_DURATION, 0, 0, 'eval', want, (u) => { error += Math.abs(want - ns.outputs[0]) * evalWeight(u) * dt; });
      const correct = error < 0.5;
      tests.push({ t0, env: l, index: k, pair: env.pair, temp: tp.temp, same, counts: same || Math.abs(tp.temp - env.pair) >= IGNORE_WITHIN, error, correct });
      run(tp.wait1, 0, 0, 'wait', NaN);
      run(REWARD_DURATION, 0, correct ? REWARD.positive : REWARD.negative, 'reward', NaN);
      run(tp.wait2, 0, 0, 'rest', NaN);
    });
  });
  return tests;
}

export function scoreTests(tests: TestResult[]): { fitness: number; accuracy: number; n: number } {
  let e = 0, ok = 0, n = 0;
  for (const t of tests) if (t.counts) { e += t.error; ok += t.correct ? 1 : 0; n++; }
  return { fitness: n ? 1 - e / n : NaN, accuracy: n ? ok / n : NaN, n };
}

/** Fitness over R random sequences (eq. 2): one minus the mean error over all counted tests. */
export function learningFitness(c: LearningController, mode: LearnMode, stage: Stage, R: number, dt: number, rs: RandomState): number {
  const ns = makeNetwork(c);
  let e = 0, n = 0;
  for (let r = 0; r < R; r++)
    for (const t of runSequence(c, drawSequence(rs, mode, stage.L, stage.K), dt, undefined, ns))
      if (t.counts) { e += t.error; n++; }
  return n ? 1 - e / n : 0;
}

export function planFor(s: LearningState): EnvPlan[] {
  return drawSequence(new RandomState(s.sequence.seed), s.mode, s.sequence.L, s.sequence.K);
}

function channelKeys(n: number): string[] {
  const keys = ['T', 'F', 'mouth', 'target', 'evalWin', 'phase', 'env'];
  for (let i = 1; i <= n; i++) keys.push(`o${i}`, `y${i}`, `I${i}`);
  return keys;
}

export interface LearningRecording extends Recording { tests?: TestResult[] }

export function simulateLearning(s: LearningState): Recording {
  const n = s.circuit.size;
  const rec = new Recorder(channelKeys(n));
  const tests = runSequence(s, planFor(s), s.dt, (ns, t, info) => {
    const v: Record<string, number> = { T: info.T, F: info.F, mouth: ns.outputs[0], target: info.target, evalWin: info.phase === 'eval' ? 1 : 0, phase: phaseNames.indexOf(info.phase), env: info.env };
    for (let i = 0; i < n; i++) { v[`o${i + 1}`] = ns.outputs[i]; v[`y${i + 1}`] = ns.states[i]; v[`I${i + 1}`] = ns.externalInputs[i]; }
    rec.push(t, v);
  });
  const sc = scoreTests(tests);
  const out = rec.finish({ fitness: sc.fitness, accuracy: sc.accuracy, tests: sc.n });
  // The test list rides along for the timeline view (plain data, structured-cloneable)
  (out as LearningRecording).tests = tests;
  return out;
}

// ------------------------------------------------------------------ analyses

/**
 * Learning map (Figure 10a): the mean weighted mouth output on the first test after a pairing,
 * over a grid of pairing × test temperatures, with mid-range delays.
 */
export function learningMap(c: LearningController, steps: number, dt: number, range: [number, number] = TEMPS): Float64Array[] {
  const ns = makeNetwork(c);
  const temps = Array.from({ length: steps }, (_, k) => range[0] + ((range[1] - range[0]) * k) / (steps - 1));
  return temps.map((pair) => Float64Array.from(temps, (temp) => {
    let m = 0;
    runSequence(c, [{ pair, delay: (PAIR_DELAY[0] + PAIR_DELAY[1]) / 2, tests: [{ temp, wait1: 10, wait2: 10 }] }], dt, (net, _t, info) => {
      if (info.phase === 'eval') m += net.outputs[0];
    }, ns);
    return m / Math.round(EVAL_DURATION / dt);
  }));
}

/** Forgetting curve (Figure 10d): fraction of correct answers on the k-th test after one pairing. */
export function forgettingCurve(c: LearningController, mode: LearnMode, tests: number, sequences: number, dt: number, seed = 1): Float64Array {
  const rs = new RandomState(seed), ns = makeNetwork(c);
  const ok = new Float64Array(tests), n = new Float64Array(tests);
  for (let r = 0; r < sequences; r++)
    for (const t of runSequence(c, drawSequence(rs, mode, 1, [tests, tests]), dt, undefined, ns))
      if (t.counts) { n[t.index]++; if (t.correct) ok[t.index]++; }
  return Float64Array.from(ok, (v, k) => (n[k] ? v / n[k] : NaN));
}

export type StrobeKind = 'pairing' | 'delay' | 'test' | 'reward+' | 'reward−';
export interface Strobe { kind: StrobeKind; state: Float64Array; pair: number; temp: number; same: boolean }

/** States strobed at the end of each pairing, delay, test signal and reward (Figures 5 and 13). */
export function strobes(c: LearningController, mode: LearnMode, sequences: number, dt: number, seed = 1): Strobe[] {
  const rs = new RandomState(seed), ns = makeNetwork(c), out: Strobe[] = [];
  for (let r = 0; r < sequences; r++) {
    const plan = drawSequence(rs, mode, 3, [1, 3]);
    let prev: Phase = 'rest', prevF = 0, pair = 0, temp = 0, same = false, last: Float64Array | null = null;
    const flush = () => {
      if (!last) return;
      const kind: StrobeKind | null = prev === 'pair' ? 'pairing' : prev === 'delay' ? 'delay' : prev === 'test' ? 'test' : prev === 'reward' ? (prevF > 0 ? 'reward+' : 'reward−') : null;
      if (kind) out.push({ kind, state: last, pair, temp, same });
    };
    runSequence(c, plan, dt, (net, _t, info) => {
      if (info.phase !== prev) flush();
      if (info.phase === 'pair') { pair = info.T; temp = NaN; }
      if (info.phase === 'test') { temp = info.T; same = info.T === pair; }
      prev = info.phase; prevF = info.F; last = Float64Array.from(net.states);
    }, ns);
    flush();
  }
  return out;
}

// ------------------------------------------------------------------ genome

export interface LearningEvoConfig {
  mode: LearnMode;
  size: number;
  /** Shaping stage (1-4). */
  stage: number;
  /** Random sequences per evaluation (the paper uses 100). */
  sequences: number;
  dt: number;
}

/** Genome of N² + 4N genes: weights, temperature weights, food weights, biases, time constants. */
export function learningGenomeSize(n: number): number {
  return n * n + 4 * n;
}

export function decodeLearning(g: ArrayLike<number>, n: number): LearningController {
  let k = 0;
  const lin = () => mapSearchParameter(g[k++], -10, 10);
  const weights = new Array(n * n).fill(0);
  for (let from = 0; from < n; from++) for (let to = 0; to < n; to++) weights[from * n + to] = lin();
  const tw = Array.from({ length: n }, lin), fw = Array.from({ length: n }, lin), biases = Array.from({ length: n }, lin);
  // Time constants are mapped exponentially into [e^0, e^5]
  const taus = Array.from({ length: n }, () => Math.exp(mapSearchParameter(g[k++], 0, 5)));
  return { circuit: { size: n, taus, biases, gains: new Array(n).fill(1), weights }, tw, fw };
}

export function learningGenomeLabels(n: number): string[] {
  const nm = learningNeuronName;
  const out: string[] = [];
  for (let from = 0; from < n; from++) for (let to = 0; to < n; to++) out.push(`w ${nm(from)}→${nm(to)}`);
  for (let i = 0; i < n; i++) out.push(`T→${nm(i)}`);
  for (let i = 0; i < n; i++) out.push(`F→${nm(i)}`);
  for (let i = 0; i < n; i++) out.push(`θ ${nm(i)}`);
  for (let i = 0; i < n; i++) out.push(`τ ${nm(i)}`);
  return out;
}

export function learningNeuronName(i: number): string {
  return i === 0 ? 'M' : `o${i + 1}`;
}

// ------------------------------------------------------------------ presets (Appendix, Tables A1 and A2)

/** Rows are source nodes (y_j), columns targets, as printed; then the T and F weights, biases and time constants. */
function fromTable(w: number[][], T: number[], F: number[], th: number[], tau: number[]): LearningController {
  const n = th.length;
  return { circuit: { size: n, taus: tau, biases: th, gains: new Array(n).fill(1), weights: w.flat() }, tw: T, fw: F };
}

export const tableA1 = fromTable(
  [[9.7529, 1.1023, -9.1226], [-5.2143, 2.2904, -1.7911], [-9.7031, -9.2973, 5.5012]],
  [-2.6291, -8.7298, -7.7723], [0.4719, 4.052, -9.9976], [2.9464, 6.4924, 7.3431], [1.2145, 27.8472, 1.0256],
);
export const tableA2 = fromTable(
  [[9.6712, 1.8562, 4.3859, -0.6227, -0.7912], [-5.1801, -2.4098, -3.5321, 8.8119, -9.9244], [-6.5417, 9.3668, 1.305, 9.7333, -5.981],
    [7.0174, 5.7888, -9.9125, -4.5742, -8.5561], [8.3435, -9.2429, 2.8769, -4.9563, 5.2326]],
  [-2.8401, 5.5182, 5.5025, -1.3114, 9.3223], [-7.6829, -1.5416, 4.2153, 3.9677, 7.6002], [-4.8178, -4.4765, -9.944, -0.7085, -5.2138],
  [1.763, 16.9439, 1.5663, 73.9571, 1.0663],
);

function stateFrom(c: LearningController, mode: LearnMode): LearningState {
  return { ...structuredClone(c), mode, sequence: { seed: 3, L: 3, K: [2, 3] }, dt: 0.1 };
}

export const learningAgent: AgentModule<LearningState, LearningEvoConfig> = {
  id: 'learning',
  name: 'Associative learning',
  citation: 'Izquierdo, Harvey & Beer (2008) Associative learning on a continuum in evolved dynamical neural networks. Adaptive Behavior 16:361-384.',

  defaultParams: () => stateFrom(tableA2, 'continuum'),

  presets: [
    { name: 'Paper: 5-node continuum learner (Table A2)', description: 'The best circuit evolved on the continuum task, from the paper\'s appendix.', params: () => stateFrom(tableA2, 'continuum') },
    { name: 'Paper: 3-node discrete learner (Table A1)', description: 'The best circuit evolved on two temperatures, from the paper\'s appendix.', params: () => stateFrom(tableA1, 'discrete') },
  ],

  simulate: simulateLearning,

  channels: (s) => {
    const n = s.circuit.size;
    const out: ChannelSpec[] = [
      { key: 'T', label: 'temperature', group: 'Stimuli', range: [0, 2] },
      { key: 'F', label: 'food / reward', group: 'Stimuli', range: [-1, 1] },
      { key: 'mouth', label: 'mouth (M output)', group: 'Stimuli', range: [0, 1] },
    ];
    for (let i = 0; i < n; i++) out.push({ key: `o${i + 1}`, label: `${learningNeuronName(i)} output`, group: 'Neuron outputs', range: [0, 1] });
    for (let i = 0; i < n; i++) out.push({ key: `y${i + 1}`, label: `${learningNeuronName(i)} state`, group: 'Neuron states' });
    for (let i = 0; i < n; i++) out.push({ key: `I${i + 1}`, label: `${learningNeuronName(i)} input`, group: 'Neuron inputs' });
    return out;
  },

  circuitView: (s) => ({
    circuit: s.circuit,
    outputKey: (i) => `o${i + 1}`,
    stateKey: (i) => `y${i + 1}`,
    inputKey: (i) => `I${i + 1}`,
    name: learningNeuronName,
  }),

  inputSweep: (s) => ({
    label: 'temperature (no food)',
    channel: 'T',
    range: [0, 2],
    inputs: (T) => s.tw.map((w) => w * T),
  }),

  defaultEvoConfig: (s) => ({ mode: s.mode, size: s.circuit.size, stage: 3, sequences: 20, dt: s.dt }),
  genomeSize: (e) => learningGenomeSize(e.size),
  decode: (g, e) => ({ ...decodeLearning(g, e.size), mode: e.mode, sequence: { seed: 3, L: 3, K: [2, 3] }, dt: e.dt }),
  evaluate: (g, e, rs) => learningFitness(decodeLearning(g, e.size), e.mode, stages[Math.max(0, Math.min(3, e.stage - 1))], e.sequences, e.dt, rs),
  genomeLabels: (e) => learningGenomeLabels(e.size),
};

