// C. elegans klinotaxis (Izquierdo & Lockery 2010; Izquierdo & Beer 2013): a worm steering up a
// chemical gradient by biasing its head sweeps. Port of Eduardo Izquierdo's CE_orientation
// (WormAgent.cpp, main.cpp); the model is described in ./body.ts.

import type { AgentModule } from '../../agent';
import type { CTRNNParams } from '../../core/ctrnn';
import { RandomState } from '../../core/random';
import { Recorder, type ChannelSpec, type Recording } from '../../core/recording';
import { mapSearchParameter } from '../../core/tsearch';
import { HST, Pi, runProtocol, StepSize, WormAgent, wormRoles, type WormMode, type WormParams } from './body';
import evolvedPresets from './evolvedPresets.json';

export { MaxDist, Pi, wormRoles, type WormMode, type WormParams } from './body';

// ------------------------------------------------------------------ main.cpp constants

export const CircuitSize = 10;
export const TransientDuration = 250.0;
export const RunDuration = 350.0;
export const EvalDuration = RunDuration - TransientDuration;
export const BiasRange = 15.0;
export const SensorWeightRange = 1500.0;
export const InterneuronWeightRange = 15.0;
export const StretchReceptorRange = 15.0;
export const MinDifSensor = 10 * StepSize;
export const MaxDifSensor = HST;
export const TauMin = 10 * StepSize;
export const TauMax = HST;
export const MinNeckTurnGain = 1.0;
export const MaxNeckTurnGain = 2.0;

// ------------------------------------------------------------------ state

export interface ChemoTrial {
  /** Initial heading (rad). The worm starts at (-4.5, 0), so heading 0 points straight at the peak. */
  orient: number;
  gradSteep: number;
  mode: WormMode;
  /** Seed of the RandomState passed to the worm (initial state draws, kinesis reorientations). */
  seed: number;
}

export interface ChemoRun {
  transient: number;
  evalDuration: number;
  dt: number;
  /** Record every k-th step. */
  sampleEvery: number;
}

export interface ChemoTrialSet {
  /** Initial headings 0, 2π/n, ... (main.cpp: 4). */
  orientations: number;
  gradSteeps: number[];
  /** Runs per heading without resetting the nervous system (main.cpp: 2). */
  repeats: number;
}

export interface ChemoState {
  worm: WormParams;
  trial: ChemoTrial;
  run: ChemoRun;
  trials: ChemoTrialSet;
}

export interface ChemoEvoConfig {
  /** CTRNN size (interneurons = size - 4; main.cpp: 10). */
  size: number;
  mode: WormMode;
  trials: ChemoTrialSet;
  run: Omit<ChemoRun, 'sampleEvery'>;
}

export const defaultTrials: ChemoTrialSet = { orientations: 4, gradSteeps: [0.5], repeats: 2 };
export const defaultRun: ChemoRun = { transient: TransientDuration, evalDuration: EvalDuration, dt: StepSize, sampleEvery: 10 };

// ------------------------------------------------------------------ names

/** Display name of neuron i (0-based) in a circuit of `size`. */
export function neuronName(i: number, size = CircuitSize): string {
  const r = wormRoles(size);
  if (i < size - 4) return `N${i + 1}`;
  if (i === r.F) return 'F';
  if (i === r.B) return 'B';
  if (i === r.SMBV) return 'SMBV';
  return 'SMBD';
}

/** Categorical color slot: interneurons 1–6, SMBV 7, SMBD 8; F/B (unused in taxis) and extra interneurons muted. */
export function neuronSlot(i: number, size = CircuitSize): number {
  const r = wormRoles(size);
  if (i === r.SMBV) return 7;
  if (i === r.SMBD) return 8;
  if (i < size - 4 && i < 6) return i + 1;
  return 0;
}

// ------------------------------------------------------------------ genome (main.cpp)

export function chemoGenomeSize(size: number): number {
  return 2 * (size - 4) + (size - 4) * (size - 4) + (size - 2) * 2 + (size - 4) + 1 + 2 * ((size - 2) + 1) + 4;
}

/** GenPhenMapping from main.cpp: search values in [-1, 1] to model parameters. */
export function genPhenMapping(gen: ArrayLike<number>, size: number): number[] {
  const phen: number[] = [];
  let k = 0;
  for (let i = 0; i < 2 * (size - 4); i++) phen.push(mapSearchParameter(gen[k++], -SensorWeightRange, SensorWeightRange));
  const nw = (size - 4) * (size - 4) + (size - 2) * 2 + (size - 4) + 1;
  for (let i = 0; i < nw; i++) phen.push(mapSearchParameter(gen[k++], -InterneuronWeightRange, InterneuronWeightRange));
  for (let i = 0; i < size - 2 + 1; i++) phen.push(mapSearchParameter(gen[k++], -BiasRange, BiasRange));
  for (let i = 0; i < size - 2 + 1; i++) phen.push(mapSearchParameter(gen[k++], TauMin, TauMax));
  phen.push(mapSearchParameter(gen[k++], 0.0, StretchReceptorRange));
  phen.push(mapSearchParameter(gen[k++], MinDifSensor, MaxDifSensor));
  phen.push(mapSearchParameter(gen[k++], MinDifSensor, MaxDifSensor));
  phen.push(mapSearchParameter(gen[k++], MinNeckTurnGain, MaxNeckTurnGain));
  return phen;
}

/** WormAgent::SetParameters: phenotype vector to a worm (0-based neurons; unlisted weights stay 0). */
export function wormFromPhenotype(v: ArrayLike<number>, size: number): WormParams {
  const n = size, ni = size - 4;
  const c: CTRNNParams = { size: n, taus: new Array(n).fill(1), biases: new Array(n).fill(0), gains: new Array(n).fill(1), weights: new Array(n * n).fill(0) };
  const w = (from: number, to: number, x: number) => { c.weights[from * n + to] = x; };
  const wASER = new Array(n).fill(0), wASEL = new Array(n).fill(0);
  let k = 0;
  for (let i = 0; i < ni; i++) wASER[i] = v[k++];
  for (let i = 0; i < ni; i++) wASEL[i] = v[k++];
  for (let i = 0; i < ni; i++) for (let j = 0; j < ni; j++) w(i, j, v[k++]);
  // Interneurons and F/B to F/B
  for (let i = 0; i < n - 2; i++) for (let j = n - 4; j <= n - 3; j++) w(i, j, v[k++]);
  // Interneurons to SMBD/SMBV with dorsoventral symmetry
  for (let i = 0; i < ni; i++) { w(i, n - 1, v[k]); w(i, n - 2, v[k]); k++; }
  w(n - 1, n - 1, v[k]); w(n - 2, n - 2, v[k]); k++;
  for (let i = 0; i < n - 2; i++) c.biases[i] = v[k++];
  c.biases[n - 1] = v[k]; c.biases[n - 2] = v[k]; k++;
  for (let i = 0; i < n - 2; i++) c.taus[i] = v[k++];
  c.taus[n - 1] = v[k]; c.taus[n - 2] = v[k]; k++;
  const wCpg = v[k++];
  const sensorN = v[k++], sensorM = v[k++], outputGain = v[k];
  return { circuit: c, wASEL, wASER, wCpgV: wCpg, wCpgD: wCpg, sensorN, sensorM, outputGain };
}

export function decodeWorm(g: ArrayLike<number>, size: number): WormParams {
  return wormFromPhenotype(genPhenMapping(g, size), size);
}

export function chemoGenomeLabels(size: number): string[] {
  const ni = size - 4, nm = (i: number) => neuronName(i, size), out: string[] = [];
  for (let i = 0; i < ni; i++) out.push(`ASER→${nm(i)}`);
  for (let i = 0; i < ni; i++) out.push(`ASEL→${nm(i)}`);
  for (let i = 0; i < ni; i++) for (let j = 0; j < ni; j++) out.push(`w ${nm(i)}→${nm(j)}`);
  for (let i = 0; i < size - 2; i++) for (let j = size - 4; j <= size - 3; j++) out.push(`w ${nm(i)}→${nm(j)}`);
  for (let i = 0; i < ni; i++) out.push(`w ${nm(i)}→SMB`);
  out.push('w SMB self');
  for (let i = 0; i < size - 2; i++) out.push(`θ ${nm(i)}`);
  out.push('θ SMB');
  for (let i = 0; i < size - 2; i++) out.push(`τ ${nm(i)}`);
  out.push('τ SMB');
  out.push('w CPG→SMB', 'sensor N', 'sensor M', 'turn gain');
  return out;
}

// ------------------------------------------------------------------ simulation

export function orientations(count: number): number[] {
  // main.cpp: for (orient = 0.0; orient < 2*Pi; orient += Pi/2), accumulated the same way
  const out: number[] = [], step = (2 * Pi) / count;
  let o = 0.0;
  for (let k = 0; k < count; k++, o += step) out.push(o);
  return out;
}

export interface TrialResult {
  orient: number;
  gradSteep: number;
  repeat: number;
  score: number;
  /** Path sampled every few steps (for overview plots). */
  x: Float64Array;
  y: Float64Array;
}

/**
 * main.cpp's EvaluationFunction: one worm (its state carries over between headings), every
 * gradient steepness and heading, `repeats` scored runs each. Returns per-run scores (and paths).
 */
export function runTrialSet(worm: WormParams, set: ChemoTrialSet, run: Omit<ChemoRun, 'sampleEvery'>, mode: WormMode, rs: RandomState, pathEvery = 0): TrialResult[] {
  const w = new WormAgent(worm), out: TrialResult[] = [];
  for (const gradSteep of set.gradSteeps)
    for (const orient of orientations(set.orientations)) {
      const xs: number[][] = Array.from({ length: set.repeats }, () => []), ys: number[][] = Array.from({ length: set.repeats }, () => []);
      const onStep = pathEvery > 0 ? (a: WormAgent, info: { repeat: number; step: number }) => {
        if (info.step % pathEvery === 0) { xs[info.repeat].push(a.px); ys[info.repeat].push(a.py); }
      } : undefined;
      const scores = runProtocol(w, { orient, gradSteep, mode, repeats: set.repeats, transient: run.transient, evalDuration: run.evalDuration, dt: run.dt }, rs, onStep);
      scores.forEach((score, repeat) => out.push({ orient, gradSteep, repeat, score, x: Float64Array.from(xs[repeat]), y: Float64Array.from(ys[repeat]) }));
    }
  return out;
}

export function trialSetFitness(results: TrialResult[]): number {
  return results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length);
}

/** Fitness exactly as EvaluationFunction computes it. */
export function evaluateWorm(worm: WormParams, set: ChemoTrialSet, run: Omit<ChemoRun, 'sampleEvery'>, mode: WormMode, rs: RandomState): number {
  let fitness = 0.0, k = 0;
  const w = new WormAgent(worm);
  for (const gradSteep of set.gradSteeps)
    for (const orient of orientations(set.orientations))
      for (const f of runProtocol(w, { orient, gradSteep, mode, repeats: set.repeats, transient: run.transient, evalDuration: run.evalDuration, dt: run.dt }, rs)) {
        fitness += f;
        k++;
      }
  return fitness / k;
}

/** The explorer's trial set, run with the explorer's seed (paths every 50 steps). */
export function runAllTrials(s: ChemoState): TrialResult[] {
  return runTrialSet(s.worm, s.trials, s.run, s.trial.mode, new RandomState(s.trial.seed), Math.max(1, Math.round(0.5 / s.run.dt)));
}

/** Fitness with half the step size, to detect numerical artifacts. */
export function refinedFitness(s: ChemoState, factor = 2): number {
  return evaluateWorm(s.worm, s.trials, { ...s.run, dt: s.run.dt / factor }, s.trial.mode, new RandomState(s.trial.seed));
}

function wrap(a: number): number {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}

function channelKeys(n: number): string[] {
  const keys = ['x', 'y', 'dist', 'heading', 'bearing', 'speed', 'turn', 'conc', 'on', 'off', 'forward', 'eval'];
  for (let i = 1; i <= n; i++) keys.push(`o${i}`, `y${i}`, `I${i}`);
  return keys;
}

/** One run (first repeat) from the trial's heading, recorded every `sampleEvery` steps. Sample 0 is the initial state. */
export function simulateChemo(s: ChemoState): Recording {
  const n = s.worm.circuit.size;
  const rec = new Recorder(channelKeys(n));
  const w = new WormAgent(s.worm);
  const every = Math.max(1, Math.round(s.run.sampleEvery));
  const push = (a: WormAgent, t: number, evaluating: boolean) => {
    const v: Record<string, number> = {
      x: a.px, y: a.py, dist: a.distanceToCentre, heading: wrap(a.orient),
      // Angle between the heading and the direction to the peak (0 = heading straight up the gradient)
      bearing: wrap(Math.atan2(-a.py, -a.px) - a.orient),
      speed: a.avgvel, turn: a.theta, conc: a.chemCon, on: a.oASEL, off: a.oASER, forward: a.forward, eval: evaluating ? 1 : 0,
    };
    const ns = a.ns;
    for (let i = 0; i < n; i++) { v[`o${i + 1}`] = ns.outputs[i]; v[`y${i + 1}`] = ns.states[i]; v[`I${i + 1}`] = ns.externalInputs[i]; }
    rec.push(t, v);
  };
  const spec = { orient: s.trial.orient, gradSteep: s.trial.gradSteep, mode: s.trial.mode, repeats: 1, transient: s.run.transient, evalDuration: s.run.evalDuration, dt: s.run.dt };
  let distSum = 0, distN = 0;
  const [score] = runProtocol(w, spec, new RandomState(s.trial.seed), (a, info) => {
    if (info.evaluating) { distSum += a.distanceToCentre; distN++; }
    if (info.step % every === 0) push(a, info.step * s.run.dt, info.evaluating);
  }, (a) => push(a, 0, false));
  return rec.finish({ score, meanDist: distN ? distSum / distN : NaN, finalDist: w.distanceToCentre });
}

// ------------------------------------------------------------------ module

interface EvolvedPreset {
  name: string;
  seed: number;
  fitness: number;
  size: number;
  genome: number[];
}

const presetsJson = evolvedPresets as EvolvedPreset[];

/** Midpoint genome (all search values 0), used only if no evolved preset exists. */
const fallbackWorm = (): WormParams => decodeWorm(new Array(chemoGenomeSize(CircuitSize)).fill(0), CircuitSize);

const defaultWorm = (): WormParams => (presetsJson.length ? decodeWorm(presetsJson[0].genome, presetsJson[0].size) : fallbackWorm());

export const chemotaxisAgent: AgentModule<ChemoState, ChemoEvoConfig> = {
  id: 'chemotaxis',
  name: 'C. elegans klinotaxis',
  citation: 'Izquierdo & Lockery (2010) J Neurosci; Izquierdo & Beer (2013) PLoS Comput Biol. Port of E. Izquierdo\'s CE_orientation (WormAgent.cpp, main.cpp).',

  defaultParams: () => ({
    worm: defaultWorm(),
    trial: { orient: Pi / 2, gradSteep: 0.5, mode: 'taxis', seed: 1 },
    run: { ...defaultRun },
    trials: { ...defaultTrials, gradSteeps: [...defaultTrials.gradSteeps] },
  }),

  presets: [
    ...presetsJson.map((p) => ({
      name: `${p.name} (${p.fitness.toFixed(3)})`,
      description: `Evolved by this site's TSearch port with main.cpp's genome and fitness, seed ${p.seed}.`,
      params: (): ChemoState => ({ ...chemotaxisAgent.defaultParams(), worm: decodeWorm(p.genome, p.size) }),
    })),
    {
      name: 'Midpoint genome (untuned)',
      description: 'Every search value at 0: the centre of each parameter range.',
      params: (): ChemoState => ({ ...chemotaxisAgent.defaultParams(), worm: fallbackWorm() }),
    },
  ],

  simulate: simulateChemo,

  channels: (s) => {
    const n = s.worm.circuit.size, nm = (i: number) => neuronName(i, n);
    const out: ChannelSpec[] = [
      { key: 'x', label: 'x (cm)', group: 'Body' },
      { key: 'y', label: 'y (cm)', group: 'Body' },
      { key: 'dist', label: 'distance to peak (cm)', group: 'Body' },
      { key: 'heading', label: 'heading (rad)', group: 'Body', range: [-Math.PI, Math.PI] },
      { key: 'bearing', label: 'bearing to peak (rad)', group: 'Body', range: [-Math.PI, Math.PI] },
      { key: 'turn', label: 'turning rate θ (rad/s)', group: 'Body' },
      { key: 'speed', label: 'speed (cm/s)', group: 'Body' },
      { key: 'conc', label: 'concentration', group: 'Sensors' },
      { key: 'on', label: 'ON cell (ASEL)', group: 'Sensors' },
      { key: 'off', label: 'OFF cell (ASER)', group: 'Sensors' },
    ];
    for (let i = 0; i < n; i++) out.push({ key: `o${i + 1}`, label: `${nm(i)} output`, group: 'Neuron outputs', range: [0, 1] });
    for (let i = 0; i < n; i++) out.push({ key: `y${i + 1}`, label: `${nm(i)} state`, group: 'Neuron states' });
    for (let i = 0; i < n; i++) out.push({ key: `I${i + 1}`, label: `${nm(i)} input`, group: 'Neuron inputs' });
    return out;
  },

  circuitView: (s) => {
    const n = s.worm.circuit.size;
    return {
      circuit: s.worm.circuit,
      outputKey: (i) => `o${i + 1}`,
      stateKey: (i) => `y${i + 1}`,
      inputKey: (i) => `I${i + 1}`,
      name: (i) => neuronName(i, n),
      colorSlot: (i) => neuronSlot(i, n),
    };
  },

  defaultEvoConfig: (s) => ({
    size: s.worm.circuit.size,
    mode: 'taxis',
    trials: { ...s.trials, gradSteeps: [...s.trials.gradSteeps] },
    // main.cpp evolves at dt = 0.01, the explorer's step size
    run: { transient: s.run.transient, evalDuration: s.run.evalDuration, dt: s.run.dt },
  }),
  genomeSize: (e) => chemoGenomeSize(e.size),
  decode: (g, e) => ({
    worm: decodeWorm(g, e.size),
    trial: { orient: Pi / 2, gradSteep: e.trials.gradSteeps[0] ?? 0.5, mode: e.mode, seed: 1 },
    run: { ...defaultRun, ...e.run },
    trials: { ...e.trials, gradSteeps: [...e.trials.gradSteeps] },
  }),
  evaluate: (g, e, rs) => evaluateWorm(decodeWorm(g, e.size), e.trials, e.run, e.mode, rs),
  genomeLabels: (e) => chemoGenomeLabels(e.size),
};
