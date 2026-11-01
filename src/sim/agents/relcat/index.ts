// Relational categorization (Williams, Beer & Gasser 2008; Beer & Williams 2015): catch the second
// falling circle if it is smaller than the first, avoid it otherwise.

import type { AgentModule } from '../../agent';
import type { Ensemble } from '../../analysis/information';
import { Recorder, type ChannelSpec, type Recording } from '../../core/recording';
import {
  decodeNet, defaultRelcatParams, genomeSize, relcatFitness, runTrial, SensorAgent, trialSizes,
  type RelcatNet, type RelcatParams,
} from './body';
import evolvedPresets from './evolvedPresets.json';

export interface RelcatState {
  net: RelcatNet;
  trial: { first: number; second: number };
  params: RelcatParams;
}

export interface RelcatEvoConfig {
  symmetric: boolean;
  params: RelcatParams;
}

/** Neuron names: interneurons N1.., then the left and right motor neurons. */
export function relcatNeuronName(i: number, size: number): string {
  if (i === size - 2) return 'ML';
  if (i === size - 1) return 'MR';
  return `N${i + 1}`;
}

function startPos(p: RelcatParams): [number, number] {
  return [(p.worldRight - p.worldLeft) / 2, p.worldBottom - p.agentRadius];
}

/** A zero network (so the page has something to show before evolution). */
function blankNet(p: RelcatParams): RelcatNet {
  const n = p.numInterneurons + 2;
  return { size: n, numRays: p.numRays, sensorWeights: new Array(p.numRays * n).fill(0), weights: new Array(n * n).fill(0), biases: new Array(n).fill(0), gains: new Array(n).fill(1), taus: new Array(n).fill(1) };
}

export function simulateRelcat(s: RelcatState): Recording {
  const p = s.params, n = s.net.size;
  const keys = ['agentX', 'ballX', 'ballY', 'ballSize', 'relX', 'phase', 'gap'];
  for (let r = 1; r <= p.numRays; r++) keys.push(`s${r}`);
  for (let i = 1; i <= n; i++) keys.push(`o${i}`, `y${i}`, `I${i}`);
  const rec = new Recorder(keys);
  const [ix, iy] = startPos(p);
  const agent = new SensorAgent(p, s.net, ix, iy);
  let t = 0;
  const { score, finalDx } = runTrial(p, agent, s.trial.first, s.trial.second, (a, b, phase) => {
    t += p.stepSize;
    const v: Record<string, number> = {
      agentX: a.x, ballX: b.cx, ballY: b.cy, ballSize: b.size, relX: a.x - b.cx, phase,
      gap: a.y - a.radius - b.leadingEdgeY(),
    };
    for (let r = 0; r < p.numRays; r++) v[`s${r + 1}`] = a.ns.sensors[r];
    for (let i = 0; i < n; i++) { v[`o${i + 1}`] = a.ns.outputs[i]; v[`y${i + 1}`] = a.ns.states[i]; v[`I${i + 1}`] = a.ns.sensorInput(i); }
    rec.push(t, v);
  });
  return rec.finish({ score, finalDx });
}

export interface RelcatTrialResult {
  first: number;
  second: number;
  score: number;
  finalDx: number;
  /** Agent x - ball x and gap to the ball, sampled through phase 2 (for overview plots). */
  relX: Float64Array;
  gap: Float64Array;
}

/** Every trial of the size grid (as in relcat's run_trials), with phase-2 paths. */
export function runAllRelcatTrials(s: RelcatState, sizes = trialSizes(s.params)): RelcatTrialResult[] {
  const p = s.params, [ix, iy] = startPos(p);
  const agent = new SensorAgent(p, s.net, ix, iy);
  const out: RelcatTrialResult[] = [];
  for (const first of sizes)
    for (const second of sizes) {
      if (first === second) continue;
      const rel: number[] = [], gap: number[] = [];
      let k = 0;
      const r = runTrial(p, agent, first, second, (a, b, phase) => {
        if (phase === 2 && k++ % 4 === 0) { rel.push(a.x - b.cx); gap.push(a.y - a.radius - b.leadingEdgeY()); }
      });
      out.push({ first, second, score: r.score, finalDx: r.finalDx, relX: Float64Array.from(rel), gap: Float64Array.from(gap) });
    }
  return out;
}

/**
 * Trial ensemble for information analysis. Trials last different times (circle size changes the
 * fall distance), so each phase is resampled onto a common axis of fall progress:
 * 0..1 = phase 1 (first circle, agent held still), 1..2 = phase 2 (second circle, agent moves).
 */
export function relcatEnsemble(s: RelcatState, sizes: number[], samplesPerPhase = 120): Ensemble {
  const p = s.params, n = s.net.size, [ix, iy] = startPos(p);
  const agent = new SensorAgent(p, s.net, ix, iy);
  const stim = { first: [] as number[], second: [] as number[], relation: [] as number[] };
  const data: Float64Array[][] = Array.from({ length: n + 1 }, () => []);
  const firstGroups = (v: number) => Math.min(3, Math.floor(((v - sizes[0]) / (sizes[sizes.length - 1] - sizes[0] + 1e-9)) * 4));
  for (const first of sizes)
    for (const second of sizes) {
      if (first === second) continue;
      const ph: number[][] = [[], []], vals: number[][][] = [[], []];
      runTrial(p, agent, first, second, (a, b, phase) => {
        ph[phase - 1].push(phase - 1);
        vals[phase - 1].push([...Array.from(a.ns.outputs), a.x - b.cx]);
      });
      // Resample each phase to samplesPerPhase points (nearest sample by progress)
      const series = Array.from({ length: n + 1 }, () => new Float64Array(2 * samplesPerPhase));
      for (let q = 0; q < 2; q++) {
        const v = vals[q];
        for (let k = 0; k < samplesPerPhase; k++) {
          const idx = Math.min(v.length - 1, Math.round((k / (samplesPerPhase - 1)) * (v.length - 1)));
          for (let c = 0; c <= n; c++) series[c][q * samplesPerPhase + k] = v[idx][c];
        }
      }
      series.forEach((sr, c) => data[c].push(sr));
      stim.first.push(firstGroups(first));
      stim.second.push(firstGroups(second));
      stim.relation.push(first > second ? 0 : 1);
    }
  const t = Float64Array.from({ length: 2 * samplesPerPhase }, (_, k) => (k < samplesPerPhase ? k / (samplesPerPhase - 1) : 1 + (k - samplesPerPhase) / (samplesPerPhase - 1)));
  const groups = ['smallest', 'small', 'large', 'largest'];
  return {
    t,
    trials: stim.first.length,
    stimuli: [
      { key: 'relation', label: 'the relation (second smaller → catch / larger → avoid)', values: Int32Array.from(stim.relation), categories: ['catch', 'avoid'] },
      { key: 'first', label: 'size of the first circle (4 groups)', values: Int32Array.from(stim.first), categories: groups },
      { key: 'second', label: 'size of the second circle (4 groups)', values: Int32Array.from(stim.second), categories: groups },
    ],
    channels: [
      ...Array.from({ length: n }, (_, i) => ({ key: `o${i + 1}`, label: relcatNeuronName(i, n), range: [0, 1] as [number, number], data: data[i] })),
      { key: 'relX', label: 'Δx (agent − circle)', data: data[n] },
    ],
  };
}

interface PresetFile { name: string; seed: number; fitness: number; symmetric: boolean; genome: number[] }

export const relcatAgent: AgentModule<RelcatState, RelcatEvoConfig> = {
  id: 'relcat',
  name: 'Relational categorization',
  citation: 'Williams, Beer & Gasser (2008); Beer & Williams (2015). Port of N. Rodriguez\'s relcat (Python).',

  defaultParams: () => {
    const p = { ...defaultRelcatParams };
    const pr = (evolvedPresets as PresetFile[])[0];
    return { net: pr ? decodeNet(pr.genome, p, pr.symmetric) : blankNet(p), trial: { first: 40, second: 25 }, params: p };
  },

  presets: (evolvedPresets as PresetFile[]).map((pr) => ({
    name: `${pr.name} (${pr.fitness.toFixed(3)})`,
    description: `Evolved by this site's TSearch port, seed ${pr.seed}.`,
    params: (): RelcatState => ({ net: decodeNet(pr.genome, defaultRelcatParams, pr.symmetric), trial: { first: 40, second: 25 }, params: { ...defaultRelcatParams } }),
  })),

  simulate: simulateRelcat,

  channels: (s) => {
    const n = s.net.size, out: ChannelSpec[] = [
      { key: 'relX', label: 'agent x − circle x', group: 'Body' },
      { key: 'agentX', label: 'agent x', group: 'Body' },
      { key: 'gap', label: 'gap to circle', group: 'Body' },
    ];
    for (let r = 1; r <= s.params.numRays; r++) out.push({ key: `s${r}`, label: `ray ${r}`, group: 'Rays', range: [0, 1] });
    for (let i = 0; i < n; i++) out.push({ key: `o${i + 1}`, label: `${relcatNeuronName(i, n)} output`, group: 'Neuron outputs', range: [0, 1] });
    for (let i = 0; i < n; i++) out.push({ key: `y${i + 1}`, label: `${relcatNeuronName(i, n)} state`, group: 'Neuron states' });
    for (let i = 0; i < n; i++) out.push({ key: `I${i + 1}`, label: `${relcatNeuronName(i, n)} sensory input`, group: 'Neuron inputs' });
    return out;
  },

  // relcat's neurons compute sigma(g y + b) = sigma(g (y + b/g)): expose biases b/g to the standard analyses
  circuitView: (s) => ({
    circuit: { size: s.net.size, taus: s.net.taus, gains: s.net.gains, weights: s.net.weights, biases: s.net.biases.map((b, i) => b / s.net.gains[i]) },
    outputKey: (i) => `o${i + 1}`,
    stateKey: (i) => `y${i + 1}`,
    inputKey: (i) => `I${i + 1}`,
    name: (i) => relcatNeuronName(i, s.net.size),
    colorSlot: (i) => i + 1,
  }),

  defaultEvoConfig: (s) => ({ symmetric: false, params: { ...s.params } }),
  genomeSize: (e) => genomeSize(e.params, e.symmetric),
  decode: (g, e) => ({ net: decodeNet(g, e.params, e.symmetric), trial: { first: 40, second: 25 }, params: { ...e.params } }),
  evaluate: (g, e) => relcatFitness(e.params, decodeNet(g, e.params, e.symmetric)),
  genomeLabels: (e) => {
    const p = e.params, ni = p.numInterneurons, n = ni + 2;
    if (e.symmetric) return Array.from({ length: genomeSize(p, true) }, (_, k) => `g${k + 1}`);
    const L: string[] = [];
    for (let r = 0; r < p.numRays; r++) for (let j = 0; j < ni; j++) L.push(`s${r + 1}→N${j + 1}`);
    for (let i = 0; i < ni; i++) for (let j = 0; j < ni; j++) L.push(`wN${i + 1}→N${j + 1}`);
    for (let i = 0; i < ni; i++) for (let j = 0; j < 2; j++) L.push(`wN${i + 1}→${relcatNeuronName(ni + j, n)}`);
    for (let i = 0; i < n; i++) L.push(`θ${relcatNeuronName(i, n)}`);
    for (let i = 0; i < n; i++) L.push(`τ${relcatNeuronName(i, n)}`);
    return L;
  },
};
