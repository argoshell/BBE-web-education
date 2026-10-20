// Visual categorization (Beer 2003): catch circles, avoid lines.

import type { AgentModule } from '../../agent';
import { CTRNN, type CTRNNParams } from '../../core/ctrnn';
import { RandomState } from '../../core/random';
import { Recorder, type ChannelSpec, type Recording } from '../../core/recording';
import { mapSearchParameter } from '../../core/tsearch';
import { BodySize, NumRays, VisualAgent, VisualObject, type ObjectShape } from './body';
import categorizeNs from './categorize.json';
import evolvedPresets from './evolvedPresets.json';

export const N = 14;
export const SENSORS = [0, 1, 2, 3, 4, 5, 6];
export const INTER = [7, 8, 9, 10, 11];
export const MOTORS = [12, 13];

/** Display name of neuron i (0-based): S1–S7 sensory, N1–N5 inter, M1–M2 motor. */
export function neuronName(i: number): string {
  if (i < 7) return `S${i + 1}`;
  if (i < 12) return `N${i - 6}`;
  return `M${i - 11}`;
}

/** Bilateral mirror of neuron i. */
export function mirror(i: number): number {
  if (i < 7) return 6 - i;
  if (i < 12) return 18 - i;
  return 25 - i;
}

export interface TrialSpec {
  shape: ObjectShape;
  /** Object's initial horizontal position relative to the agent. */
  offset: number;
  /** Object fall velocity (negative = downward). */
  vy: number;
  size: number;
}

export interface TrialSet {
  /** Trials per shape, with offsets evenly spaced in [-range, range]. */
  count: number;
  range: number;
  vy: number;
  size: number;
}

export interface VisualState {
  circuit: CTRNNParams;
  trial: TrialSpec;
  trials: TrialSet;
  dt: number;
  /** Horizontal distances are clipped to this for scoring. */
  maxDistance: number;
}

export interface VisualRanges {
  tau: [number, number];
  bias: [number, number];
  weight: [number, number];
  gain: [number, number];
}

export interface VisualEvoConfig {
  symmetric: boolean;
  ranges: VisualRanges;
  trials: TrialSet;
  dt: number;
  maxDistance: number;
}

// An even count keeps offset 0 out: a bilaterally symmetric agent cannot break symmetry there.
export const defaultTrials: TrialSet = { count: 10, range: 50, vy: -3, size: 30 };

// ------------------------------------------------------------------ genome

interface Gene {
  label: string;
  kind: 'tau' | 'bias' | 'gain' | 'weight';
  /** Neuron indices (tau/bias/gain) or flat weight indices from*N+to. */
  targets: number[];
}

const geneCache = new Map<boolean, Gene[]>();

/**
 * Genome layout. Sensory neurons share one time constant, bias and gain. With symmetry,
 * mirror-image interneurons, motor neurons and connections share genes.
 */
export function genes(symmetric: boolean): Gene[] {
  const cached = geneCache.get(symmetric);
  if (cached) return cached;
  const out: Gene[] = [
    { label: 'τ S', kind: 'tau', targets: SENSORS },
    { label: 'θ S', kind: 'bias', targets: SENSORS },
    { label: 'g S', kind: 'gain', targets: SENSORS },
  ];
  const neuronOrbits = (ids: number[]) => {
    const seen = new Set<number>(), orbits: number[][] = [];
    for (const i of ids) {
      if (seen.has(i)) continue;
      const o = symmetric && mirror(i) !== i ? [i, mirror(i)] : [i];
      o.forEach((k) => seen.add(k));
      orbits.push(o);
    }
    return orbits;
  };
  const name = (o: number[]) => o.map(neuronName).join('/');
  for (const kind of ['tau', 'bias'] as const)
    for (const o of neuronOrbits([...INTER, ...MOTORS])) out.push({ label: `${kind === 'tau' ? 'τ' : 'θ'} ${name(o)}`, kind, targets: o });
  const conns: [number, number][] = [];
  for (const s of SENSORS) for (const j of INTER) conns.push([s, j]);
  for (const i of INTER) for (const j of INTER) conns.push([i, j]);
  for (const j of INTER) for (const m of MOTORS) conns.push([j, m]);
  const seen = new Set<number>();
  for (const [a, b] of conns) {
    const k = a * N + b;
    if (seen.has(k)) continue;
    const km = mirror(a) * N + mirror(b);
    const targets = symmetric && km !== k ? [k, km] : [k];
    targets.forEach((t) => seen.add(t));
    out.push({ label: `w ${neuronName(a)}→${neuronName(b)}`, kind: 'weight', targets });
  }
  geneCache.set(symmetric, out);
  return out;
}

export const defaultVisualRanges: VisualRanges = { tau: [1, 2], bias: [-5, 5], weight: [-5, 5], gain: [1, 5] };

export function decodeVisual(g: ArrayLike<number>, symmetric: boolean, r: VisualRanges): CTRNNParams {
  const c: CTRNNParams = { size: N, taus: new Array(N).fill(1), biases: new Array(N).fill(0), gains: new Array(N).fill(1), weights: new Array(N * N).fill(0) };
  genes(symmetric).forEach((gene, k) => {
    const range = r[gene.kind];
    const v = mapSearchParameter(g[k], range[0], range[1]);
    const arr = gene.kind === 'tau' ? c.taus : gene.kind === 'bias' ? c.biases : gene.kind === 'gain' ? c.gains : c.weights;
    for (const t of gene.targets) arr[t] = v;
  });
  return c;
}

// ------------------------------------------------------------------ simulation

export function trialOffsets(set: TrialSet): number[] {
  if (set.count <= 1) return [0];
  return Array.from({ length: set.count }, (_, k) => -set.range + (2 * set.range * k) / (set.count - 1));
}

/** Score of one trial: 1 - d for circles (catch), d for lines (avoid); d = clipped |dx| / max. */
export function trialScore(shape: ObjectShape, finalDx: number, maxDistance: number): number {
  const d = Math.min(Math.abs(finalDx), maxDistance) / maxDistance;
  return shape === 'circle' ? 1 - d : d;
}

/** Run one trial, optionally calling onStep after each step. Returns the final horizontal offset. */
export function runTrial(ns: CTRNN, trial: TrialSpec, dt: number, onStep?: (a: VisualAgent, o: VisualObject, t: number) => void): number {
  const a = new VisualAgent(ns);
  const obj = new VisualObject(trial.shape, trial.offset, 275, trial.vy, trial.size);
  a.reset(new RandomState(1), 0, 0, false);
  onStep?.(a, obj, 0);
  let t = 0;
  for (; obj.cy > BodySize / 2; t += dt) {
    a.step(dt, obj);
    obj.step(dt);
    onStep?.(a, obj, t + dt);
  }
  return a.cx - obj.cx;
}

export interface TrialResult {
  shape: ObjectShape;
  offset: number;
  finalDx: number;
  score: number;
  /** Agent x minus object x, and object y, sampled every few steps (for overview plots). */
  relX: Float64Array;
  objY: Float64Array;
}

/** Run every trial in the set (used for the overview figure). */
export function runAllTrials(s: VisualState, sampleEvery = 4): TrialResult[] {
  const out: TrialResult[] = [];
  for (const shape of ['circle', 'line'] as const)
    for (const offset of trialOffsets(s.trials)) {
      const rel: number[] = [], oy: number[] = [];
      let k = 0;
      const finalDx = runTrial(CTRNN.fromParams(s.circuit), { shape, offset, vy: s.trials.vy, size: s.trials.size }, s.dt, (a, o) => {
        if (k++ % sampleEvery === 0) { rel.push(a.cx - o.cx); oy.push(o.cy); }
      });
      out.push({ shape, offset, finalDx, score: trialScore(shape, finalDx, s.maxDistance), relX: Float64Array.from(rel), objY: Float64Array.from(oy) });
    }
  return out;
}

function evaluateCircuit(c: CTRNNParams, set: TrialSet, dt: number, maxDistance: number): number {
  let total = 0, n = 0;
  const ns = CTRNN.fromParams(c);
  for (const shape of ['circle', 'line'] as const)
    for (const offset of trialOffsets(set)) {
      const dx = runTrial(ns, { shape, offset, vy: set.vy, size: set.size }, dt);
      total += trialScore(shape, dx, maxDistance);
      n++;
    }
  return total / n;
}

function channelKeys(): string[] {
  const keys = ['agentX', 'objectX', 'objectY', 'relX', 'vx'];
  for (let i = 1; i <= NumRays; i++) keys.push(`ray${i}`);
  for (let i = 1; i <= N; i++) keys.push(`o${i}`, `y${i}`, `I${i}`);
  return keys;
}

export function simulateVisual(s: VisualState): Recording {
  const rec = new Recorder(channelKeys());
  const finalDx = runTrial(CTRNN.fromParams(s.circuit), s.trial, s.dt, (a, o, t) => {
    const v: Record<string, number> = { agentX: a.cx, objectX: o.cx, objectY: o.cy, relX: a.cx - o.cx, vx: a.vx };
    // Ray lengths as seen at this position (what the agent will sense on its next step)
    a.resetRays();
    a.rays.forEach((r, i) => { const c = { ...r }; o.rayIntersection(c); v[`ray${i + 1}`] = c.length; });
    const ns = a.nervousSystem;
    for (let i = 0; i < N; i++) { v[`o${i + 1}`] = ns.outputs[i]; v[`y${i + 1}`] = ns.states[i]; v[`I${i + 1}`] = ns.externalInputs[i]; }
    rec.push(t, v);
  });
  return rec.finish({ finalDx, score: trialScore(s.trial.shape, finalDx, s.maxDistance) });
}

export const beerCategorize: CTRNNParams = categorizeNs as CTRNNParams;

export const visualAgent: AgentModule<VisualState, VisualEvoConfig> = {
  id: 'visual',
  name: 'Visual categorizer',
  citation: 'Beer (2003) The dynamics of active categorical perception. Port of VisualAgent.cpp (M. Setzler).',

  defaultParams: () => ({
    circuit: structuredClone(beerCategorize),
    trial: { shape: 'circle', offset: 25, vy: -3, size: 30 },
    trials: { ...defaultTrials },
    dt: 0.1,
    maxDistance: 45,
  }),

  presets: [
    {
      name: "Beer/Setzler's categorize.ns",
      description: 'The evolved categorizer shipped with EvolutionaryAgents v1.2.',
      params: () => visualAgent.defaultParams(),
    },
    // Generated with scripts/evolve.ts --agent visual (population 96, symmetric genome, default trial set)
    ...(evolvedPresets as { name: string; seed: number; fitness: number; circuit: CTRNNParams; trials: TrialSet; maxDistance: number }[]).map((p) => ({
      name: `${p.name} (${p.fitness.toFixed(3)})`,
      description: `Evolved by this site's TSearch port, seed ${p.seed}.`,
      params: (): VisualState => ({ ...visualAgent.defaultParams(), circuit: structuredClone(p.circuit), trials: { ...p.trials }, maxDistance: p.maxDistance }),
    })),
  ],

  simulate: simulateVisual,

  channels: () => {
    const out: ChannelSpec[] = [
      { key: 'relX', label: 'agent x − object x', group: 'Body' },
      { key: 'agentX', label: 'agent x', group: 'Body' },
      { key: 'objectY', label: 'object height', group: 'Body' },
      { key: 'vx', label: 'agent velocity', group: 'Body' },
    ];
    for (let i = 1; i <= NumRays; i++) out.push({ key: `ray${i}`, label: `ray ${i} length`, group: 'Rays' });
    for (let i = 0; i < N; i++) out.push({ key: `o${i + 1}`, label: `${neuronName(i)} output`, group: 'Neuron outputs', range: [0, 1] });
    for (let i = 0; i < N; i++) out.push({ key: `y${i + 1}`, label: `${neuronName(i)} state`, group: 'Neuron states' });
    for (let i = 0; i < N; i++) out.push({ key: `I${i + 1}`, label: `${neuronName(i)} input`, group: 'Neuron inputs' });
    return out;
  },

  circuitView: (s) => ({
    circuit: s.circuit,
    outputKey: (i) => `o${i + 1}`,
    stateKey: (i) => `y${i + 1}`,
    inputKey: (i) => `I${i + 1}`,
    name: neuronName,
    colorSlot: (i) => (i >= 7 && i < 12 ? i - 6 : i >= 12 ? i - 6 : 0),
  }),

  defaultEvoConfig: (s) => ({ symmetric: true, ranges: { ...defaultVisualRanges }, trials: { ...s.trials }, dt: s.dt, maxDistance: s.maxDistance }),
  genomeSize: (e) => genes(e.symmetric).length,
  decode: (g, e) => ({
    circuit: decodeVisual(g, e.symmetric, e.ranges),
    trial: { shape: 'circle', offset: e.trials.range / 2, vy: e.trials.vy, size: e.trials.size },
    trials: { ...e.trials },
    dt: e.dt,
    maxDistance: e.maxDistance,
  }),
  evaluate: (g, e) => evaluateCircuit(decodeVisual(g, e.symmetric, e.ranges), e.trials, e.dt, e.maxDistance),
  genomeLabels: (e) => genes(e.symmetric).map((g) => g.label),
};
