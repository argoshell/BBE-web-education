// Visually guided tasks from Eduardo Izquierdo's VisuallyGuidedAgent (with Randall Beer and Matthew
// Setzler; github.com/edizquierdo/VisuallyGuidedAgent, main.cpp):
//
//  - Object-size discrimination (CircleSizeCategorization): a circle of diameter 20–40 falls;
//    catch circles smaller than the body (30), avoid larger ones.
//  - Perceiving affordances (PerceiveAffordance): two falling line segments leave an aperture of
//    width 20–40; pass through apertures wider than the body, avoid narrower ones.
//
// Both use the same agent (GuidedAgent in body.ts: 15 rays → 7 interneurons → 2 motors, left-right
// symmetric genome GPM_LAYER_SYM_ODD) and the same trial grid. The original evolves on the product
// of the two fitnesses (MultipleTasks).

import type { AgentModule } from '../../agent';
import { CTRNN, type CTRNNParams } from '../../core/ctrnn';
import { Recorder, type ChannelSpec, type Recording } from '../../core/recording';
import { mapSearchParameter } from '../../core/tsearch';
import { Aperture, BodySize, GuidedAgent, VisualObject } from './body';
import guidedPresets from './guidedPresets.json';

export const NUMRAYS = 15;
export const NUMINTER = 7;
export const NUMMOTOR = 2;
export const CIRCUITSIZE = NUMINTER + NUMMOTOR;
const H_NUMRAYS = Math.ceil(NUMRAYS / 2);
const H_NUMINTER = Math.ceil(NUMINTER / 2);
const H_NUMMOTOR = Math.ceil(NUMMOTOR / 2);
export const STARTHEIGHT = 240;
/** Width of each aperture line segment (and the circle's initial size). */
export const OBJECTHEIGHT = 30;

export type GuidedTask = 'size' | 'aperture';
export type GuidedEvoTask = GuidedTask | 'both';

export const taskInfo: Record<GuidedTask, { name: string; small: string; large: string }> = {
  size: { name: 'Object-size discrimination', small: 'catch', large: 'avoid' },
  aperture: { name: 'Perceiving affordances', small: 'avoid', large: 'pass through' },
};

/** Display name of CTRNN neuron i (0-based): N1–N7 interneurons, M1–M2 motor. */
export function guidedNeuronName(i: number): string {
  return i < NUMINTER ? `N${i + 1}` : `M${i - NUMINTER + 1}`;
}

/** The trial grid of main.cpp: `for (pos = min; pos <= max; pos += step) if (pos != 0)`, same for sizes (skipping BodySize). */
export interface TrialGrid {
  posMin: number;
  posMax: number;
  posStep: number;
  sizeMin: number;
  sizeMax: number;
  sizeStep: number;
  /** Repetitions per trial (REPS + 1 in main.cpp). Trials are deterministic, so these only weight the mean. */
  reps: number;
}

export const defaultGrid: TrialGrid = { posMin: 0, posMax: 25, posStep: 2, sizeMin: 20, sizeMax: 40, sizeStep: 2, reps: 2 };

export function gridTrials(g: TrialGrid): { pos: number; size: number }[] {
  const out: { pos: number; size: number }[] = [];
  if (!(g.posStep > 0) || !(g.sizeStep > 0)) return out;
  for (let pos = g.posMin; pos <= g.posMax; pos += g.posStep) {
    if (pos === 0) continue;
    for (let size = g.sizeMin; size <= g.sizeMax; size += g.sizeStep) if (size !== BodySize) out.push({ pos, size });
  }
  return out;
}

export interface GuidedController {
  /** The 9-neuron CTRNN (interneurons, then motors). */
  circuit: CTRNNParams;
  /** Ray → interneuron weights, row-major by ray: sensorWeights[ray * NUMINTER + inter]. */
  sensorWeights: number[];
}

export interface GuidedState extends GuidedController {
  task: GuidedTask;
  /** The trial shown in the explorer: object (or aperture center) x and circle diameter (or gap width). */
  trial: { pos: number; size: number };
  grid: TrialGrid;
  dt: number;
  /** Final distances are clipped to this when scoring (MAXDISTANCE). */
  maxDistance: number;
}

export interface GuidedRanges {
  weight: number;
  bias: number;
  tau: [number, number];
  gain: [number, number];
}

export interface GuidedEvoConfig {
  task: GuidedEvoTask;
  ranges: GuidedRanges;
  grid: TrialGrid;
  dt: number;
  maxDistance: number;
}

/** WEIGHTMAX, BIASMAX, TAUMIN/MAX, GAINMIN/MAX of main.cpp. */
export const defaultGuidedRanges: GuidedRanges = { weight: 10, bias: 10, tau: [1, 2], gain: [1, 5] };

// ------------------------------------------------------------------ genome (GPM_LAYER_SYM_ODD)

export const GENOME_SIZE =
  (H_NUMRAYS - 1) * NUMINTER + H_NUMINTER + (H_NUMINTER - 1) * NUMINTER + H_NUMINTER + (H_NUMINTER - 1) * NUMMOTOR + H_NUMMOTOR + 3 * (H_NUMINTER + 1);
const NUM_WEIGHT_GENES = GENOME_SIZE - 3 * (H_NUMINTER + 1);

/** GenPhenMapping (main.cpp) followed by VisualAgent::SetController, with 0-based indices. */
export function decodeGuided(gen: ArrayLike<number>, r: GuidedRanges = defaultGuidedRanges): GuidedController {
  const phen: number[] = [];
  for (let k = 0; k < GENOME_SIZE; k++) {
    const block = k < NUM_WEIGHT_GENES ? 0 : 1 + Math.floor((k - NUM_WEIGHT_GENES) / (H_NUMINTER + 1));
    phen.push(block === 0 ? mapSearchParameter(gen[k], -r.weight, r.weight)
      : block === 1 ? mapSearchParameter(gen[k], -r.bias, r.bias)
        : block === 2 ? mapSearchParameter(gen[k], r.tau[0], r.tau[1])
          : mapSearchParameter(gen[k], r.gain[0], r.gain[1]));
  }
  const n = CIRCUITSIZE, NI = NUMINTER, NR = NUMRAYS, NM = NUMMOTOR;
  const c: CTRNNParams = { size: n, taus: new Array(n).fill(1), biases: new Array(n).fill(0), gains: new Array(n).fill(1), weights: new Array(n * n).fill(0) };
  const sw = new Array(NR * NI).fill(0);
  // 1-based helpers matching the C++
  const S = (i: number, j: number, v: number) => { sw[(i - 1) * NI + (j - 1)] = v; };
  const W = (i: number, j: number, v: number) => { c.weights[(i - 1) * n + (j - 1)] = v; };
  let k = 0;
  for (let i = 1; i <= H_NUMRAYS - 1; i++)
    for (let j = 1; j <= NI; j++) { S(i, j, phen[k]); S(NR - i + 1, NI - j + 1, phen[k]); k++; }
  for (let j = 1; j <= H_NUMINTER; j++) { S(H_NUMRAYS, j, phen[k]); S(H_NUMRAYS, NI - j + 1, phen[k]); k++; }
  for (let i = 1; i <= H_NUMINTER - 1; i++)
    for (let j = 1; j <= NI; j++) { W(i, j, phen[k]); W(NI - i + 1, NI - j + 1, phen[k]); k++; }
  for (let j = 1; j <= H_NUMINTER; j++) { W(H_NUMINTER, j, phen[k]); W(H_NUMINTER, NI - j + 1, phen[k]); k++; }
  for (let i = 1; i <= H_NUMINTER - 1; i++)
    for (let j = NI + 1; j <= NI + NM; j++) { W(i, j, phen[k]); W(NI - i + 1, NI + NM - j + NI + 1, phen[k]); k++; }
  W(H_NUMINTER, NI + NM - 1, phen[k]);
  W(H_NUMINTER, NI + NM, phen[k]);
  k++;
  for (const arr of [c.biases, c.taus, c.gains]) {
    for (let i = 1; i <= H_NUMINTER; i++) { arr[i - 1] = phen[k]; arr[NI - i] = phen[k]; k++; }
    for (let i = NI + 1; i <= NI + NM; i++) arr[i - 1] = phen[k];
    k++;
  }
  return { circuit: c, sensorWeights: sw };
}

/** Labels for each gene, in genome order (mirror partners shown after a slash). */
export function guidedGenomeLabels(): string[] {
  const NI = NUMINTER, NR = NUMRAYS;
  const ray = (i: number) => `R${i}`;
  const nn = (i: number) => guidedNeuronName(i - 1);
  const out: string[] = [];
  for (let i = 1; i <= H_NUMRAYS - 1; i++) for (let j = 1; j <= NI; j++) out.push(`w ${ray(i)}→${nn(j)} / ${ray(NR - i + 1)}→${nn(NI - j + 1)}`);
  for (let j = 1; j <= H_NUMINTER; j++) out.push(`w ${ray(H_NUMRAYS)}→${nn(j)}/${nn(NI - j + 1)}`);
  for (let i = 1; i <= H_NUMINTER - 1; i++) for (let j = 1; j <= NI; j++) out.push(`w ${nn(i)}→${nn(j)} / ${nn(NI - i + 1)}→${nn(NI - j + 1)}`);
  for (let j = 1; j <= H_NUMINTER; j++) out.push(`w ${nn(H_NUMINTER)}→${nn(j)}/${nn(NI - j + 1)}`);
  for (let i = 1; i <= H_NUMINTER - 1; i++) for (let m = 1; m <= NUMMOTOR; m++) out.push(`w ${nn(i)}→M${m} / ${nn(NI - i + 1)}→M${NUMMOTOR - m + 1}`);
  out.push(`w ${nn(H_NUMINTER)}→M1/M2`);
  for (const p of ['θ', 'τ', 'g']) {
    for (let i = 1; i <= H_NUMINTER; i++) out.push(i === NI - i + 1 ? `${p} ${nn(i)}` : `${p} ${nn(i)}/${nn(NI - i + 1)}`);
    out.push(`${p} M1/M2`);
  }
  return out;
}

// ------------------------------------------------------------------ simulation

export interface GuidedTrialSpec {
  task: GuidedTask;
  pos: number;
  size: number;
}

type StepHook = (a: GuidedAgent, objY: number, t: number) => void;

/** One trial as in main.cpp. Returns the final distance |agent x − pos|. */
export function runGuidedTrial(ctl: GuidedController, spec: GuidedTrialSpec, dt: number, onStep?: StepHook, ns?: CTRNN): number {
  const a = new GuidedAgent(ns ?? CTRNN.fromParams(ctl.circuit), ctl.sensorWeights, NUMRAYS, NUMINTER);
  a.reset(0, 0);
  a.setPositionX(0);
  if (spec.task === 'size') {
    const obj = new VisualObject('circle', spec.pos, STARTHEIGHT, -3, spec.size);
    const objs = [obj];
    onStep?.(a, obj.cy, 0);
    for (let t = 0; obj.cy > BodySize; t += dt) {
      a.step(dt, objs);
      obj.step(dt);
      onStep?.(a, obj.cy, t + dt);
    }
    return Math.abs(a.cx - obj.cx);
  }
  const ap = new Aperture(spec.pos, spec.size, STARTHEIGHT, -3, OBJECTHEIGHT);
  const objs = [ap.left, ap.right];
  onStep?.(a, ap.cy, 0);
  for (let t = 0; ap.cy > BodySize; t += dt) {
    a.step(dt, objs);
    ap.step(dt);
    onStep?.(a, ap.cy, t + dt);
  }
  return Math.abs(a.cx - spec.pos);
}

/** Score of one trial in [0, 1]: the "small" response for size < BodySize, the "large" one otherwise. */
export function guidedScore(task: GuidedTask, size: number, d: number, maxDistance: number): number {
  const approach = d > maxDistance ? 0.0 : (maxDistance - d) / maxDistance;
  const avoid = d > maxDistance ? 1.0 : d / maxDistance;
  // size task: catch small circles, avoid large; aperture task: avoid narrow gaps, pass wide ones
  return (size < BodySize) === (task === 'size') ? approach : avoid;
}

/** CircleSizeCategorization / PerceiveAffordance for one controller. */
export function guidedTaskFitness(ctl: GuidedController, task: GuidedTask, grid: TrialGrid, dt: number, maxDistance: number): number {
  const ns = CTRNN.fromParams(ctl.circuit);
  let fit = 0.0, trials = 0;
  for (const { pos, size } of gridTrials(grid)) {
    const score = guidedScore(task, size, runGuidedTrial(ctl, { task, pos, size }, dt, undefined, ns), maxDistance);
    // Repetitions are identical (no noise), so add the same score again rather than resimulating
    for (let r = 0; r < grid.reps; r++) { fit += score; trials += 1; }
  }
  return trials ? fit / trials : 0;
}

/** Fitness for an evolution task; 'both' is MultipleTasks (affordance × size fitness). */
export function guidedFitness(ctl: GuidedController, task: GuidedEvoTask, grid: TrialGrid, dt: number, maxDistance: number): number {
  if (task !== 'both') return guidedTaskFitness(ctl, task, grid, dt, maxDistance);
  const fit1 = guidedTaskFitness(ctl, 'aperture', grid, dt, maxDistance);
  const fit2 = guidedTaskFitness(ctl, 'size', grid, dt, maxDistance);
  return fit1 * fit2;
}

export interface GuidedTrialResult {
  pos: number;
  size: number;
  finalDistance: number;
  /** Signed final offset, agent x − pos. */
  finalDx: number;
  score: number;
  /** Agent x − pos and object height, sampled every few steps (for overview plots). */
  relX: Float64Array;
  objY: Float64Array;
}

/** Every distinct trial of the grid for the state's task (overview figure). */
export function runAllGuidedTrials(s: GuidedState, sampleEvery = 4): GuidedTrialResult[] {
  const ns = CTRNN.fromParams(s.circuit);
  return gridTrials(s.grid).map(({ pos, size }) => {
    const rel: number[] = [], oy: number[] = [];
    let k = 0, last = 0;
    const d = runGuidedTrial(s, { task: s.task, pos, size }, s.dt, (a, y) => {
      last = a.cx - pos;
      if (k++ % sampleEvery === 0) { rel.push(last); oy.push(y); }
    }, ns);
    return { pos, size, finalDistance: d, finalDx: last, score: guidedScore(s.task, size, d, s.maxDistance), relX: Float64Array.from(rel), objY: Float64Array.from(oy) };
  });
}

/** Mean trial score per task, weighting repetitions as in main.cpp. */
export function meanScore(results: GuidedTrialResult[]): number {
  return results.reduce((t, r) => t + r.score, 0) / Math.max(1, results.length);
}

function channelKeys(): string[] {
  const keys = ['agentX', 'objectX', 'objectY', 'relX', 'vx'];
  for (let i = 1; i <= NUMRAYS; i++) keys.push(`ray${i}`, `in${i}`);
  for (let i = 1; i <= CIRCUITSIZE; i++) keys.push(`o${i}`, `y${i}`, `I${i}`);
  return keys;
}

export function simulateGuided(s: GuidedState): Recording {
  const rec = new Recorder(channelKeys());
  const { task } = s;
  const { pos, size } = s.trial;
  // Stimulus at a given height, for computing the ray lengths the agent sees there
  const probe = (y: number) => {
    if (task === 'size') return [new VisualObject('circle', pos, y, -3, size)];
    const ap = new Aperture(pos, size, y, -3, OBJECTHEIGHT);
    return [ap.left, ap.right];
  };
  const d = runGuidedTrial(s, { task, pos, size }, s.dt, (a, y, t) => {
    const v: Record<string, number> = { agentX: a.cx, objectX: pos, objectY: y, relX: a.cx - pos, vx: a.vx };
    // Ray lengths as seen from this position (what the agent will sense on its next step)
    a.resetRays();
    const objs = probe(y);
    a.rays.forEach((r, i) => {
      const c = { ...r };
      for (const o of objs) o.rayIntersection(c);
      v[`ray${i + 1}`] = c.length;
      v[`in${i + 1}`] = a.inputs[i];
    });
    const ns = a.nervousSystem;
    for (let i = 0; i < CIRCUITSIZE; i++) { v[`o${i + 1}`] = ns.outputs[i]; v[`y${i + 1}`] = ns.states[i]; v[`I${i + 1}`] = ns.externalInputs[i]; }
    rec.push(t, v);
  });
  return rec.finish({ finalDistance: d, score: guidedScore(task, size, d, s.maxDistance) });
}

// ------------------------------------------------------------------ presets and module

interface GuidedPresetFile {
  name: string;
  task: GuidedEvoTask;
  seed: number;
  gens: number;
  fitness: number;
  genome: number[];
}

export const guidedPresetList = guidedPresets as GuidedPresetFile[];

function presetState(p: GuidedPresetFile, task: GuidedTask): GuidedState {
  return { ...decodeGuided(p.genome), task, trial: { pos: 10, size: 24 }, grid: { ...defaultGrid }, dt: 0.1, maxDistance: 75 };
}

const fallbackGenome = new Array(GENOME_SIZE).fill(0);

export const guidedAgent: AgentModule<GuidedState, GuidedEvoConfig> = {
  id: 'guided',
  name: 'Visually guided tasks',
  citation: 'Izquierdo, Beer & Setzler, VisuallyGuidedAgent (github.com/edizquierdo/VisuallyGuidedAgent): size discrimination and perceiving affordances.',

  defaultParams: () => (guidedPresetList.length ? presetState(guidedPresetList[0], guidedPresetList[0].task === 'aperture' ? 'aperture' : 'size')
    : { ...decodeGuided(fallbackGenome), task: 'size', trial: { pos: 10, size: 24 }, grid: { ...defaultGrid }, dt: 0.1, maxDistance: 75 }),

  // Generated with scripts/evolve.ts --agent guided --task size|aperture|both (population 96)
  presets: guidedPresetList.map((p) => ({
    name: `${p.task === 'both' ? 'Both tasks' : taskInfo[p.task].name} (${p.fitness.toFixed(3)})`,
    description: `Evolved by this site's TSearch port on the ${p.task === 'both' ? 'product of both task fitnesses (as in main.cpp)' : `${p.task} task`}, seed ${p.seed}, ${p.gens} generations.`,
    params: () => presetState(p, p.task === 'aperture' ? 'aperture' : 'size'),
  })),

  simulate: simulateGuided,

  channels: () => {
    const out: ChannelSpec[] = [
      { key: 'relX', label: 'agent x − object x', group: 'Body' },
      { key: 'agentX', label: 'agent x', group: 'Body' },
      { key: 'objectY', label: 'object height', group: 'Body' },
      { key: 'vx', label: 'agent velocity', group: 'Body' },
    ];
    for (let i = 1; i <= NUMRAYS; i++) out.push({ key: `ray${i}`, label: `ray ${i} length`, group: 'Rays' });
    for (let i = 1; i <= NUMRAYS; i++) out.push({ key: `in${i}`, label: `ray ${i} input`, group: 'Ray inputs', range: [0, 1] });
    for (let i = 0; i < CIRCUITSIZE; i++) out.push({ key: `o${i + 1}`, label: `${guidedNeuronName(i)} output`, group: 'Neuron outputs', range: [0, 1] });
    for (let i = 0; i < CIRCUITSIZE; i++) out.push({ key: `y${i + 1}`, label: `${guidedNeuronName(i)} state`, group: 'Neuron states' });
    for (let i = 0; i < CIRCUITSIZE; i++) out.push({ key: `I${i + 1}`, label: `${guidedNeuronName(i)} input`, group: 'Neuron inputs' });
    return out;
  },

  circuitView: (s) => ({
    circuit: s.circuit,
    outputKey: (i) => `o${i + 1}`,
    stateKey: (i) => `y${i + 1}`,
    inputKey: (i) => `I${i + 1}`,
    name: guidedNeuronName,
    colorSlot: guidedColorSlot,
  }),

  defaultEvoConfig: (s) => ({ task: 'both', ranges: { ...defaultGuidedRanges, tau: [...defaultGuidedRanges.tau], gain: [...defaultGuidedRanges.gain] }, grid: { ...s.grid }, dt: s.dt, maxDistance: s.maxDistance }),
  genomeSize: () => GENOME_SIZE,
  decode: (g, e) => ({
    ...decodeGuided(g, e.ranges),
    task: e.task === 'aperture' ? 'aperture' : 'size',
    trial: { pos: 10, size: 24 },
    grid: { ...e.grid },
    dt: e.dt,
    maxDistance: e.maxDistance,
  }),
  evaluate: (g, e) => guidedFitness(decodeGuided(g, e.ranges), e.task, e.grid, e.dt, e.maxDistance),
  genomeLabels: () => guidedGenomeLabels(),
};

/** Interneurons N1–N7 use slots 1–7, M1 slot 8, M2 the muted color (only 8 categorical slots). */
export function guidedColorSlot(i: number): number {
  return i < 8 ? i + 1 : 0;
}
