// Walker configuration, genome encoding, fitness evaluation and recorded simulation.

import { CTRNN, type CTRNNParams } from '../../core/ctrnn';
import { RandomState } from '../../core/random';
import { Recorder, type Recording } from '../../core/recording';
import { inverseMapSearchParameter, mapSearchParameter } from '../../core/tsearch';
import { defaultBody, LeggedAgent, type ControllerKind, type LegBodyParams } from './body';

export interface WalkerParams {
  controller: ControllerKind;
  circuit: CTRNNParams;
  /** Angle-sensor weights, one per neuron (used by the 'sensor' controller). */
  sensorWeights: number[];
  body: LegBodyParams;
}

export interface RunOptions {
  duration: number;
  dt: number;
  /** Randomize the initial leg angle and neuron states (LeggedAgent::Reset randomize flag). */
  randomize: boolean;
  seed: number;
}

export const defaultRun: RunOptions = { duration: 220, dt: 0.1, randomize: false, seed: 1 };

/** Parameter ranges used to decode a genome in [-1, 1]^n. */
export interface GenomeRanges {
  tau: [number, number];
  bias: [number, number];
  weight: [number, number];
  sensor: [number, number];
  /** If set, gains are evolved within this range; otherwise fixed at 1. */
  gain?: [number, number];
}

export const defaultRanges: GenomeRanges = {
  tau: [0.5, 10],
  bias: [-16, 16],
  weight: [-16, 16],
  sensor: [-16, 16],
};

export interface WalkerGenomeSpec {
  controller: ControllerKind;
  size: number;
  ranges: GenomeRanges;
}

export const minNeurons: Record<ControllerKind, number> = { cpg: 3, sensor: 3, two: 2, one: 1, perfect: 0 };

/** Genome layout: taus[N], biases[N], [gains[N]], weights[N*N] (row = from), [sensor[N]]. */
export function genomeSize(spec: WalkerGenomeSpec): number {
  const n = spec.size;
  if (spec.controller === 'perfect') return 0;
  return 2 * n + (spec.ranges.gain ? n : 0) + n * n + (spec.controller === 'sensor' ? n : 0);
}

export function decodeGenome(g: ArrayLike<number>, spec: WalkerGenomeSpec, body = defaultBody): WalkerParams {
  const n = spec.size, r = spec.ranges;
  let k = 0;
  const next = (range: [number, number]) => mapSearchParameter(g[k++], range[0], range[1]);
  const taus = Array.from({ length: n }, () => next(r.tau));
  const biases = Array.from({ length: n }, () => next(r.bias));
  const gains = r.gain ? Array.from({ length: n }, () => next(r.gain!)) : new Array(n).fill(1);
  const weights = Array.from({ length: n * n }, () => next(r.weight));
  const sensorWeights = spec.controller === 'sensor' ? Array.from({ length: n }, () => next(r.sensor)) : new Array(n).fill(0);
  return { controller: spec.controller, circuit: { size: n, taus, biases, gains, weights }, sensorWeights, body };
}

export function encodeGenome(p: WalkerParams, spec: WalkerGenomeSpec): Float64Array {
  const r = spec.ranges, c = p.circuit;
  const out: number[] = [];
  const put = (x: number, range: [number, number]) => out.push(inverseMapSearchParameter(x, range[0], range[1]));
  c.taus.forEach((x) => put(x, r.tau));
  c.biases.forEach((x) => put(x, r.bias));
  if (r.gain) c.gains.forEach((x) => put(x, r.gain!));
  c.weights.forEach((x) => put(x, r.weight));
  if (spec.controller === 'sensor') p.sensorWeights.forEach((x) => put(x, r.sensor));
  return Float64Array.from(out);
}

export function makeAgent(p: WalkerParams): LeggedAgent {
  const a = new LeggedAgent(CTRNN.fromParams(p.circuit), p.body);
  a.sensorWeights = Float64Array.from(p.sensorWeights);
  return a;
}

/** Average velocity over a run: the fitness used for walking. */
export function evaluateWalker(p: WalkerParams, run: RunOptions, rs: RandomState): number {
  const a = makeAgent(p);
  a.reset(0, 0, run.randomize, rs);
  for (let t = 0; t < run.duration; t += run.dt) a.step(p.controller, run.dt);
  return a.cx / run.duration;
}

export function walkerChannelKeys(n: number): string[] {
  const keys = ['cx', 'vx', 'angle', 'omega', 'footState', 'forwardForce', 'backwardForce', 'footX', 'footY', 'jointX', 'jointY'];
  for (let i = 1; i <= n; i++) keys.push(`o${i}`, `y${i}`, `I${i}`);
  return keys;
}

/** Simulate and record every step. Sample 0 is the state right after reset. */
export function simulateWalker(p: WalkerParams, run: RunOptions): Recording {
  const a = makeAgent(p);
  const rs = new RandomState(run.seed);
  a.reset(0, 0, run.randomize, rs);
  const n = p.circuit.size;
  const rec = new Recorder(walkerChannelKeys(n));
  const sample = (t: number) => {
    const leg = a.leg, ns = a.nervousSystem;
    const v: Record<string, number> = {
      cx: a.cx, vx: a.vx, angle: leg.angle, omega: leg.omega, footState: leg.footState,
      forwardForce: leg.forwardForce, backwardForce: leg.backwardForce,
      footX: leg.footX, footY: leg.footY, jointX: leg.jointX, jointY: leg.jointY,
    };
    for (let i = 0; i < n; i++) {
      v[`o${i + 1}`] = ns.outputs[i];
      v[`y${i + 1}`] = ns.states[i];
      v[`I${i + 1}`] = ns.externalInputs[i];
    }
    rec.push(t, v);
  };
  sample(0);
  let t = 0;
  for (; t < run.duration; t += run.dt) {
    a.step(p.controller, run.dt);
    sample(t + run.dt);
  }
  return rec.finish({ avgVelocity: a.cx / run.duration, distance: a.cx });
}
