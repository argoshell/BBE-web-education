// Visually guided orientation (Beer 1996, "Toward the evolution of dynamical neural networks for
// minimally cognitive behavior", §4): catch circles falling with random horizontal and vertical
// velocities. A purely reactive (feedforward) agent stops pursuing an object once it leaves the
// field of view; letting the motor neurons have time constants and recurrent connections lets it
// keep going: the "object persistence" result.

import type { AgentModule } from '../../agent';
import { RandomState } from '../../core/random';
import type { Recording } from '../../core/recording';
import { CTRNN } from '../../core/ctrnn';
import { Pi } from '../visual/body';
import { runFalls, type Eye, type Fall } from './body';
import { minimalChannels, minimalCircuitView, performance, recordFalls, samplePaths, type Body, type MinimalController, type PathSample } from './common';
import { decode, genomeLabels, genomeSize, type Arch, type Ranges } from './network';
import presets from './orientationPresets.json';

export const orientEye: Eye = { rays: 5, length: 220, angle: Pi / 6 };
/** Assumed (the paper's 0.2 cannot catch its own objects): the velocity gain of the later experiments. */
export const ORIENT_VEL_GAIN = 5;
export const orientBody: Body = { eye: orientEye, velGain: ORIENT_VEL_GAIN };

export type OrientKind = 'reactive' | 'dynamical';
export const orientArchs: Record<OrientKind, Arch> = {
  // 5 ray neurons → 2 motor neurons, time constants 1: 8 parameters
  reactive: { sensors: 5, inter: 0, sensorToMotor: true, motorRecurrent: false, evolveTau: false },
  // plus time constants and symmetric self and cross connections between the motor neurons: 12
  dynamical: { sensors: 5, inter: 0, sensorToMotor: true, motorRecurrent: true, evolveTau: true },
};
/** Ray bias range [−10, 0] (Slocum et al.); the printed [−10, −5] cannot hold the evolved means the paper reports (−0.85, −2.06). */
export const orientRanges: Ranges = { weight: [-5, 5], bias: [-5, 5], sensorBias: [-10, 0], gain: [1, 5], tau: [1, 2] };

/** Initial offset, horizontal velocity and vertical velocity (downward is negative). */
export interface OrientTrial { x: number; vx: number; vy: number }

/**
 * The paper's evaluation trials are only drawn (Figure 2): six paths over offsets within ±70, plus two
 * with large horizontal and small vertical velocity added to fix the reactive agents' weakness. These
 * eight are a reconstruction in mirror-image pairs. Each path passes through the field of view.
 */
export const orientEvalTrials: OrientTrial[] = [
  { x: -60, vx: 2, vy: -3 }, { x: 60, vx: -2, vy: -3 },
  { x: -20, vx: -1, vy: -5 }, { x: 20, vx: 1, vy: -5 },
  { x: -50, vx: 1.5, vy: -2.5 }, { x: 50, vx: -1.5, vy: -2.5 },
  // fast and shallow: the object crosses the field of view and ends against a wall
  { x: 60, vx: -3, vy: -1 }, { x: -60, vx: 3, vy: -1 },
];

export const orientAssumptions = [
  'Velocity gain 5 (as in Slocum et al. 2000) instead of the printed 0.2. With motor outputs in [0, 1], a gain of 0.2 caps the speed at 0.2, which is too slow to reach objects offset by up to 70.',
  'The eight evaluation trials are a reconstruction of the paths drawn in the paper\'s Figure 2 (mirror-image pairs, the last two fast and shallow).',
  'Objects stop moving horizontally at the walls (x = ±200). A trial ends when the object\'s center reaches the top of the agent (y = 15), as in Beer\'s VisualAgent code.',
  'Ray sensor biases lie in [−10, 0] instead of the printed [−10, −5], which cannot contain the evolved mean biases the paper reports (−0.85 and −2.06). With biases below −5 the rays only respond to nearby objects.',
  "Objects start at height 220, inside the rays' reach (about 235), rather than at the top of the 275-high world. Dropped from 275, fast sideways objects leave before they can be seen, and the paper's 96.6% on random trials would be out of reach.",
  'Search: this site\'s TSearch with its own population and generation counts, not the paper\'s evolution strategy.',
];

export function randomOrientTrial(rs: RandomState): OrientTrial {
  return { x: rs.uniformRandom(-70, 70), vx: rs.uniformRandom(-6, 6), vy: -rs.uniformRandom(0.5, 5) };
}

export function randomOrientTrials(count: number, seed: number): OrientTrial[] {
  const rs = new RandomState(seed);
  return Array.from({ length: count }, () => randomOrientTrial(rs));
}

/**
 * Assumed start height. Objects dropped from the world's top (275) start out of the rays' reach (≈ 235), so
 * fast sideways objects would never be seen, and the paper's 96.6% on random trials could not be reached.
 */
export const ORIENT_START_Y = 220;
const fall = (t: OrientTrial): Fall => ({ x: t.x, vx: t.vx, vy: t.vy, y: ORIENT_START_Y });

export interface OrientState extends MinimalController {
  kind: OrientKind;
  trial: OrientTrial;
  dt: number;
}

export interface OrientEvoConfig { kind: OrientKind; ranges: Ranges; dt: number }

/** Mean horizontal miss distance over the trials. */
export function meanMiss(c: MinimalController, trials: OrientTrial[], dt: number): number {
  const ns = CTRNN.fromParams(c.circuit);
  let sum = 0;
  for (const t of trials) sum += Math.abs(runFalls(ns, orientEye, ORIENT_VEL_GAIN, [fall(t)], dt).dx[0]);
  return sum / trials.length;
}

export function orientPerformance(c: MinimalController, trials: OrientTrial[], dt: number): number {
  return performance(meanMiss(c, trials, dt));
}

export interface OrientResult { trial: OrientTrial; dx: number; paths: PathSample }

export function runOrientTrials(s: OrientState, trials: OrientTrial[]): OrientResult[] {
  return trials.map((trial) => {
    const { paths, out } = samplePaths(s, orientBody, [fall(trial)], s.dt);
    return { trial, dx: out.dx[0], paths };
  });
}

export function simulateOrient(s: OrientState): Recording {
  const { rec, out } = recordFalls(s, orientBody, [fall(s.trial)], s.dt);
  rec.summary = { dx: out.dx[0], score: performance(Math.abs(out.dx[0])) };
  return rec;
}

interface PresetFile { name: string; kind: OrientKind; seed: number; fitness: number; genome: number[] }

function fromGenome(kind: OrientKind, genome: ArrayLike<number>, ranges = orientRanges, dt = 0.1): OrientState {
  const arch = orientArchs[kind];
  return { arch, kind, circuit: decode(genome, arch, ranges), trial: { x: -39, vx: -4.7, vy: -0.9 }, dt };
}

export const orientationAgent: AgentModule<OrientState, OrientEvoConfig> = {
  id: 'orientation',
  name: 'Visual orientation',
  citation: 'Beer (1996) Toward the evolution of dynamical neural networks for minimally cognitive behavior. From Animals to Animats 4, pp. 421-429.',

  defaultParams: () => {
    const p = (presets as PresetFile[]).find((q) => q.kind === 'dynamical');
    return p ? fromGenome('dynamical', p.genome) : fromGenome('dynamical', new Array(genomeSize(orientArchs.dynamical)).fill(0));
  },

  presets: (presets as PresetFile[]).map((p) => ({
    name: `${p.name} (${(p.fitness * 100).toFixed(1)}%)`,
    description: `Evolved by this site's TSearch, seed ${p.seed}.`,
    params: () => fromGenome(p.kind, p.genome),
  })),

  simulate: simulateOrient,
  channels: (s) => minimalChannels(s, orientEye, 1),
  circuitView: minimalCircuitView,

  defaultEvoConfig: (s) => ({ kind: s.kind, ranges: structuredClone(orientRanges), dt: s.dt }),
  genomeSize: (e) => genomeSize(orientArchs[e.kind]),
  decode: (g, e) => fromGenome(e.kind, g, e.ranges, e.dt),
  evaluate: (g, e) => orientPerformance({ arch: orientArchs[e.kind], circuit: decode(g, orientArchs[e.kind], e.ranges) }, orientEvalTrials, e.dt),
  genomeLabels: (e) => genomeLabels(orientArchs[e.kind]),
};
