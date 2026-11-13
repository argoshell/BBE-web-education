// Delayed response / short-term memory (Slocum, Downey & Beer 2000, §5; after Gallagher & Beer 1999):
// catch a falling circle while blind. As soon as the agent starts to move its proximity sensors are
// switched off for good, so it must glimpse the object, then act on what it saw. In the vertical
// version objects fall straight down; in the diagonal version they also drift sideways, so a single
// glimpse of position is not enough.

import type { AgentModule } from '../../agent';
import { CTRNN } from '../../core/ctrnn';
import type { Recording } from '../../core/recording';
import { RandomState } from '../../core/random';
import { Pi } from '../visual/body';
import { runFalls, type Eye, type Fall } from './body';
import { minimalChannels, minimalCircuitView, performance, recordFalls, samplePaths, type Body, type MinimalController, type PathSample } from './common';
import { decode, genomeLabels, genomeSize, type Arch, type Ranges } from './network';
import presets from './memoryPresets.json';

export const memoryEye: Eye = { rays: 9, length: 205, angle: Pi / 6 };
export const memoryBody: Body = { eye: memoryEye, velGain: 5 };
export const FALL_SPEED = 2;
/** Penalty (diagonal version) for starting to move within the first 5 integration steps. */
export const EARLY_PENALTY = 20;

export type MemoryTask = 'vertical' | 'diagonal';
export const memoryArchs: Record<MemoryTask, Arch> = {
  vertical: { sensors: 9, inter: 4, sensorToMotor: true, motorRecurrent: true, evolveTau: true }, // 56 parameters
  diagonal: { sensors: 9, inter: 6, sensorToMotor: true, motorRecurrent: true, evolveTau: true }, // 82 parameters
};
export const slocumRanges: Ranges = { weight: [-5, 5], bias: [-5, 5], sensorBias: [-10, 0], gain: [1, 5], tau: [1, 2] };

export interface MemoryTrial { x: number; vx: number }

/** Twelve trials evenly spaced over [0, 55] (vertical); 7 offsets in [0, 50] × 4 drifts in [−1, 1] (diagonal: 28). */
export function memoryEvalTrials(task: MemoryTask): MemoryTrial[] {
  if (task === 'vertical') return Array.from({ length: 12 }, (_, k) => ({ x: (55 * k) / 11, vx: 0 }));
  const out: MemoryTrial[] = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) out.push({ x: (50 * i) / 6, vx: -1 + (2 * j) / 3 });
  return out;
}

export function randomMemoryTrials(task: MemoryTask, count: number, seed: number): MemoryTrial[] {
  const rs = new RandomState(seed);
  return Array.from({ length: count }, () => ({ x: rs.uniformRandom(-50, 50), vx: task === 'diagonal' ? rs.uniformRandom(-1, 1) : 0 }));
}

export const memoryAssumptions = [
  'The agent counts as moving, and goes blind, once it is 0.1 units from where it started. The paper says only "as soon as an agent began to move". A bilaterally symmetric agent stays exactly still until something breaks the symmetry, but floating-point rounding makes its velocity tiny rather than zero, so a threshold is needed.',
  "Objects start at height 190, inside the rays' reach. The paper says a sufficiently peripheral object \"will immediately intersect the outermost ray\", which rules out starting at the world's top (275). A trial ends when the object's center reaches the top of the agent (y = 15).",
  'All CTRNN gains except the sensors\' and interneurons\' are 1. This gives the paper\'s parameter counts (56 and 82).',
  'The evaluation trials use positive offsets only, as in the paper. A symmetric agent behaves the same on the mirror image.',
  'Search: this site\'s TSearch, not the paper\'s GA settings.',
];

/**
 * Assumed start height, inside the rays' reach. The paper notes that "a sufficiently peripheral object will
 * immediately intersect the outermost ray", which can only happen if objects start within reach of the rays
 * (about 210), not at the world's top (275). Same height as the selective attention task.
 */
export const MEMORY_START_Y = 190;
const fall = (t: MemoryTrial): Fall => ({ x: t.x, vx: t.vx, vy: -FALL_SPEED, y: MEMORY_START_Y });

export interface MemoryState extends MinimalController {
  task: MemoryTask;
  trial: MemoryTrial;
  blindAfter: number;
  dt: number;
}

export interface MemoryEvoConfig { task: MemoryTask; ranges: Ranges; dt: number; blindAfter: number }

/** Error of one trial: the final horizontal distance, plus 20 for moving within 5 steps (diagonal). */
export function memoryError(task: MemoryTask, dx: number, blindT: number, dt: number): number {
  return Math.abs(dx) + (task === 'diagonal' && blindT <= 5 * dt + 1e-9 ? EARLY_PENALTY : 0);
}

export function memoryPerformance(c: MinimalController, task: MemoryTask, trials: MemoryTrial[], dt: number, blindAfter: number): number {
  const ns = CTRNN.fromParams(c.circuit);
  let sum = 0;
  for (const t of trials) {
    const o = runFalls(ns, memoryEye, memoryBody.velGain, [fall(t)], dt, { blindAfter });
    sum += memoryError(task, o.dx[0], o.blindT, dt);
  }
  return performance(sum / trials.length);
}

export interface MemoryResult { trial: MemoryTrial; dx: number; blindT: number; finalAgentX: number; finalObjectX: number; paths: PathSample }

export function runMemoryTrials(s: MemoryState, trials: MemoryTrial[]): MemoryResult[] {
  return trials.map((trial) => {
    const { paths, out } = samplePaths(s, memoryBody, [fall(trial)], s.dt, { blindAfter: s.blindAfter });
    const last = paths.t.length - 1;
    return { trial, dx: out.dx[0], blindT: out.blindT, finalAgentX: paths.agentX[last], finalObjectX: paths.agentX[last] - out.dx[0], paths };
  });
}

export function simulateMemory(s: MemoryState): Recording {
  const { rec, out } = recordFalls(s, memoryBody, [fall(s.trial)], s.dt, { blindAfter: s.blindAfter });
  rec.summary = { dx: out.dx[0], blindT: out.blindT, score: performance(memoryError(s.task, out.dx[0], out.blindT, s.dt)) };
  return rec;
}

interface PresetFile { name: string; task: MemoryTask; seed: number; fitness: number; genome: number[] }

export function memoryStateFor(task: MemoryTask, genome: ArrayLike<number>, ranges = slocumRanges, dt = 0.1, blindAfter = 0.1): MemoryState {
  const arch = memoryArchs[task];
  return { arch, task, circuit: decode(genome, arch, ranges), trial: { x: 35, vx: task === 'diagonal' ? 0.5 : 0 }, blindAfter, dt };
}

export const memoryAgent: AgentModule<MemoryState, MemoryEvoConfig> = {
  id: 'memory',
  name: 'Delayed response',
  citation: 'Slocum, Downey & Beer (2000) Further experiments in the evolution of minimally cognitive behavior: From perceiving affordances to selective attention. SAB 2000, §5.',

  defaultParams: () => {
    const p = (presets as PresetFile[])[0];
    return p ? memoryStateFor(p.task, p.genome) : memoryStateFor('vertical', new Array(genomeSize(memoryArchs.vertical)).fill(0));
  },

  presets: (presets as PresetFile[]).map((p) => ({
    name: `${p.name} (${(p.fitness * 100).toFixed(1)}%)`,
    description: `Evolved by this site's TSearch, seed ${p.seed}.`,
    params: () => memoryStateFor(p.task, p.genome),
  })),

  simulate: simulateMemory,
  channels: (s) => [...minimalChannels(s, memoryEye, 1), { key: 'blind', label: 'blind', group: 'Body', range: [0, 1] }],
  circuitView: minimalCircuitView,

  defaultEvoConfig: (s) => ({ task: s.task, ranges: structuredClone(slocumRanges), dt: s.dt, blindAfter: s.blindAfter }),
  genomeSize: (e) => genomeSize(memoryArchs[e.task]),
  decode: (g, e) => memoryStateFor(e.task, g, e.ranges, e.dt, e.blindAfter),
  evaluate: (g, e) => memoryPerformance({ arch: memoryArchs[e.task], circuit: decode(g, memoryArchs[e.task], e.ranges) }, e.task, memoryEvalTrials(e.task), e.dt, e.blindAfter),
  genomeLabels: (e) => genomeLabels(memoryArchs[e.task]),
};
