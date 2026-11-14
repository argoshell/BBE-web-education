// Selective attention (Slocum, Downey & Beer 2000, §6; Goldenberg, Garcowski & Beer 2004): catch two
// circles that fall at different speeds. The agent must attend to the one that will land first while
// ignoring the other, then find the second, which may have left its field of view ("object
// permanence"). Sometimes the one that starts farther away lands first ("passing objects").

import type { AgentModule } from '../../agent';
import { CTRNN } from '../../core/ctrnn';
import type { Recording } from '../../core/recording';
import { RandomState } from '../../core/random';
import { Pi } from '../visual/body';
import { BODY_SIZE, ENV_WIDTH, MovingCircle, ProximityAgent, runFalls, type Eye, type Fall } from './body';
import { minimalChannels, minimalCircuitView, performance, recordFalls, samplePaths, type Body, type MinimalController, type PathSample } from './common';
import { decode, genomeLabels, genomeSize, type Arch, type Ranges } from './network';
import { slocumRanges } from './memory';
import presets from './attentionPresets.json';

export const attentionEye: Eye = { rays: 9, length: 205, angle: Pi / 6 };
export const attentionBody: Body = { eye: attentionEye, velGain: 5 };
/** Assumed start height: low enough that both objects can start inside the field of view (the rays reach y ≈ 213-220). */
export const START_Y = 190;
/** |x1 − x2| / |t1 − t2| ≤ β · 5, with β = 0.7, so the agent can get from the first landing point to the second. */
export const BETA = 0.7;

export function attentionArch(inter: number): Arch {
  return { sensors: 9, inter, sensorToMotor: true, motorRecurrent: true, evolveTau: true };
}

/** Object 1 falls fast (vy in [3, 4]) and lands first; object 2 falls slowly (vy in [1, 2]). */
export interface AttentionTrial { x1: number; vx1: number; vy1: number; x2: number; vx2: number; vy2: number }

const falls = (t: AttentionTrial): Fall[] => [{ x: t.x1, vx: t.vx1, vy: -t.vy1, y: START_Y }, { x: t.x2, vx: t.vx2, vy: -t.vy2, y: START_Y }];

function landing(x: number, vx: number, vy: number): { x: number; t: number } {
  const t = (START_Y - BODY_SIZE / 2) / vy;
  return { x: Math.max(-ENV_WIDTH / 2, Math.min(ENV_WIDTH / 2, x + vx * t)), t };
}

/** Whether an agent at x sees a circle at (ox, oy). */
function visibleFrom(x: number, ox: number, oy: number): boolean {
  const a = new ProximityAgent(CTRNN.fromParams({ size: 11, taus: new Array(11).fill(1), biases: new Array(11).fill(0), gains: new Array(11).fill(1), weights: new Array(121).fill(0) }), attentionEye, 5);
  a.cx = x;
  return a.sees(new MovingCircle(ox, oy, 0, 0));
}

export function validTrial(t: AttentionTrial): boolean {
  if (!visibleFrom(0, t.x1, START_Y) || !visibleFrom(0, t.x2, START_Y)) return false;
  const l1 = landing(t.x1, t.vx1, t.vy1), l2 = landing(t.x2, t.vx2, t.vy2);
  return Math.abs(l1.x - l2.x) / Math.abs(l1.t - l2.t) <= BETA * attentionBody.velGain;
}

const trialCache = new Map<string, AttentionTrial[]>();

/** Random trials as in Goldenberg et al. (2004), rejecting those the agent could not solve. */
export function randomAttentionTrials(count: number, seed: number): AttentionTrial[] {
  const key = `${count}:${seed}`, hit = trialCache.get(key);
  if (hit) return hit;
  const rs = new RandomState(seed), out: AttentionTrial[] = [];
  while (out.length < count) {
    const t: AttentionTrial = {
      x1: rs.uniformRandom(-70, 70), vx1: rs.uniformRandom(-2, 2), vy1: rs.uniformRandom(3, 4),
      x2: rs.uniformRandom(-70, 70), vx2: rs.uniformRandom(-2, 2), vy2: rs.uniformRandom(1, 2),
    };
    if (validTrial(t)) out.push(t);
  }
  trialCache.set(key, out);
  return out;
}

export interface TrialCategory {
  /** Passing objects: the object that starts farther away lands first ("delayed decision"). */
  po: boolean;
  /** Object permanence: the second object is out of view when the agent catches the first. */
  op: boolean;
}

export function categorize(t: AttentionTrial): TrialCategory {
  const l1 = landing(t.x1, t.vx1, t.vy1);
  const y2 = START_Y - t.vy2 * l1.t, x2 = Math.max(-ENV_WIDTH / 2, Math.min(ENV_WIDTH / 2, t.x2 + t.vx2 * l1.t));
  return { po: Math.abs(t.x1) > Math.abs(t.x2), op: !visibleFrom(l1.x, x2, y2) };
}

export const categoryNames = ['neither', 'passing only', 'permanence only', 'both'] as const;
export function categoryIndex(c: TrialCategory): number {
  return (c.po ? 1 : 0) + (c.op ? 2 : 0);
}

export const attentionAssumptions = [
  `Objects start at height ${START_Y}, so that both can be inside the field of view as Goldenberg et al. require. The papers don't give a height, and the rays only reach y ≈ 213–220.`,
  'Initial offsets are drawn from ±70 and kept only when both objects are visible at the start and the agent could travel from the first landing point to the second (|x₁ − x₂| / |t₁ − t₂| ≤ 0.7 · 5).',
  "The preset was evolved offline with the papers' shaping (scripts/shape-attention.ts). Trials grow from 1 toward 35: a new one is added when the best agent beats T = 198 − n/14 − gen/2500 out of 200, or after 600 generations without a change. Each new trial is the first random one the best agent scores below 170 on, and at 35 trials it replaces the agent's easiest. The run used 10 interneurons, a population of 100, mutation variance 1 and 9000 generations, as in Slocum et al. It had reached 28 trials by the end. Evolution in the browser uses a fixed set of random trials instead.",
  'Trial categories: "passing objects" means the object that starts farther from the agent lands first. "Object permanence" means an agent that caught the first object exactly could not see the second at that moment.',
  'A trial ends for each object when its center reaches the top of the agent (y = 15). That object is then removed.',
];

export interface AttentionState extends MinimalController {
  trial: AttentionTrial;
  dt: number;
}

export interface AttentionEvoConfig { inter: number; ranges: Ranges; dt: number; trials: number; seed: number }

/** One trial's performance as the papers define it: (200 − error) / 200, not floored (it can be negative). */
export function trialPerformance(dx: number[]): number {
  return (200 - attentionError(dx)) / 200;
}

export function attentionError(dx: number[]): number {
  return Math.abs(dx[0]) + Math.abs(dx[1]);
}

export function attentionPerformance(c: MinimalController, trials: AttentionTrial[], dt: number): number {
  const ns = CTRNN.fromParams(c.circuit);
  let sum = 0;
  for (const t of trials) sum += attentionError(runFalls(ns, attentionEye, 5, falls(t), dt).dx);
  return performance(sum / trials.length);
}

export interface AttentionResult { trial: AttentionTrial; dx: number[]; category: TrialCategory; score: number; paths: PathSample }

export function runAttentionTrials(s: AttentionState, trials: AttentionTrial[]): AttentionResult[] {
  return trials.map((trial) => {
    const { paths, out } = samplePaths(s, attentionBody, falls(trial), s.dt);
    return { trial, dx: out.dx, category: categorize(trial), score: trialPerformance(out.dx), paths };
  });
}

export function simulateAttention(s: AttentionState): Recording {
  const { rec, out } = recordFalls(s, attentionBody, falls(s.trial), s.dt);
  rec.summary = { dx1: out.dx[0], dx2: out.dx[1], score: trialPerformance(out.dx) };
  return rec;
}

/** The default trial: the farther object falls faster, and the slower one is out of view when the first lands. */
export const exampleTrial: AttentionTrial = { x1: -52.08, vx1: -0.62, vy1: 3, x2: 46.33, vx2: 1.19, vy2: 1.07 };

interface PresetFile { name: string; inter: number; seed: number; fitness: number; shaped?: boolean; genome: number[] }

function fromGenome(inter: number, genome: ArrayLike<number>, ranges = slocumRanges, dt = 0.1): AttentionState {
  const arch = attentionArch(inter);
  return { arch, circuit: decode(genome, arch, ranges), trial: { ...exampleTrial }, dt };
}

export const attentionAgent: AgentModule<AttentionState, AttentionEvoConfig> = {
  id: 'attention',
  name: 'Selective attention',
  citation: 'Slocum, Downey & Beer (2000), §6; Goldenberg, Garcowski & Beer (2004) May we have your attention: Analysis of a selective attention task. SAB 2004.',

  defaultParams: () => {
    const p = (presets as PresetFile[])[0];
    return p ? fromGenome(p.inter, p.genome) : fromGenome(4, new Array(genomeSize(attentionArch(4))).fill(0));
  },

  presets: (presets as PresetFile[]).map((p) => ({
    name: `${p.name} (${(p.fitness * 100).toFixed(1)}%)`,
    description: p.shaped
      ? `Evolved for 9000 generations with the papers' shaping schedule (scripts/shape-attention.ts, seed ${p.seed}); the percentage is its performance on 300 fresh random trials.`
      : `Evolved by this site's TSearch (seed ${p.seed}).`,
    params: () => fromGenome(p.inter, p.genome),
  })),

  simulate: simulateAttention,
  channels: (s) => minimalChannels(s, attentionEye, 2),
  circuitView: minimalCircuitView,

  defaultEvoConfig: (s) => ({ inter: s.arch.inter, ranges: structuredClone(slocumRanges), dt: s.dt, trials: 100, seed: 2 }),
  genomeSize: (e) => genomeSize(attentionArch(e.inter)),
  decode: (g, e) => fromGenome(e.inter, g, e.ranges, e.dt),
  evaluate: (g, e) => attentionPerformance({ arch: attentionArch(e.inter), circuit: decode(g, attentionArch(e.inter), e.ranges) }, randomAttentionTrials(e.trials, e.seed), e.dt),
  genomeLabels: (e) => genomeLabels(attentionArch(e.inter)),
};
