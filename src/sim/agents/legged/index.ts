// The one-legged walker (Beer & Gallagher 1992; Beer, Chiel & Gallagher 1999).

import type { AgentModule } from '../../agent';
import type { CTRNNParams } from '../../core/ctrnn';
import type { ChannelSpec } from '../../core/recording';
import evolvedPresets from './evolvedPresets.json';
import { defaultBody, type ControllerKind } from './body';
import {
  decodeGenome, defaultRanges, defaultRun, evaluateWalker, genomeSize, minNeurons, simulateWalker,
  type GenomeRanges, type RunOptions, type WalkerGenomeSpec, type WalkerParams,
} from './walker';

export interface WalkerState extends WalkerParams {
  run: RunOptions;
}

export interface WalkerEvoConfig {
  spec: WalkerGenomeSpec;
  run: RunOptions;
  body: WalkerParams['body'];
}

/** Beer's evolved 5-neuron CPG walker, cpg.ns from the EvolutionaryAgents package. */
export const beerCpg: CTRNNParams = {
  size: 5,
  taus: [6.196245, 2.515073, 8.67099, 9.918356, 9.252712],
  biases: [14.589926, 10.762988, -3.919602, 9.76748, -2.826332],
  gains: [1, 1, 1, 1, 1],
  weights: [
    -15.800203, 15.311454, -8.851767, -10.042705, -10.913972,
    9.944963, -6.748288, 11.78331, -9.133361, 15.878405,
    -12.175295, -13.495099, 8.688801, 7.616306, 11.278046,
    -0.425391, -2.001676, -14.620253, 6.691054, -11.390638,
    -4.839062, -11.4249, 11.858115, 0.49043, -6.396606,
  ],
};

export const controllerInfo: Record<ControllerKind, { label: string; description: string }> = {
  cpg: { label: 'CTRNN CPG (Step)', description: 'No sensory feedback. Neuron 1 sets the foot (down when > 0.5), neuron 2 swings forward, neuron 3 swings backward.' },
  sensor: { label: 'CTRNN + angle sensor', description: 'As Step, plus leg-angle feedback to every neuron: Iᵢ = sᵢ · angle / 30°. An extension of the original code.' },
  two: { label: '2-neuron (Step2)', description: 'Neuron 1 sets the foot and forward force; neuron 2 the backward force.' },
  one: { label: '1-neuron (Step1)', description: 'A single neuron with leg-angle input (angle · 5/30°). Output > 0.5 puts the foot down and pushes.' },
  perfect: { label: 'PerfectStep (optimal)', description: 'The hand-designed optimal pattern: put the foot down at the front limit, lift when it falls too far behind.' },
};

/** A blank circuit of size n with the given controller kind (a small center-crossing start). */
export function blankCircuit(n: number): CTRNNParams {
  return {
    size: n,
    taus: new Array(n).fill(1),
    biases: new Array(n).fill(0),
    gains: new Array(n).fill(1),
    weights: new Array(n * n).fill(0),
  };
}

/** Resize a circuit, keeping existing parameters where possible. */
export function resizeCircuit(c: CTRNNParams, n: number): CTRNNParams {
  const out = blankCircuit(n);
  for (let i = 0; i < Math.min(n, c.size); i++) {
    out.taus[i] = c.taus[i];
    out.biases[i] = c.biases[i];
    out.gains[i] = c.gains[i];
    for (let j = 0; j < Math.min(n, c.size); j++) out.weights[i * n + j] = c.weights[i * c.size + j];
  }
  return out;
}

export function withController(s: WalkerState, kind: ControllerKind): WalkerState {
  const n = Math.max(minNeurons[kind], kind === 'perfect' ? 0 : s.circuit.size);
  const circuit = n === s.circuit.size ? s.circuit : resizeCircuit(s.circuit, n);
  const sensorWeights = Array.from({ length: n }, (_, i) => s.sensorWeights[i] ?? 0);
  return { ...s, controller: kind, circuit, sensorWeights };
}

function neuronChannels(n: number): ChannelSpec[] {
  const out: ChannelSpec[] = [];
  for (let i = 1; i <= n; i++) out.push({ key: `o${i}`, label: `o${i} (output)`, group: 'Neuron outputs', range: [0, 1] });
  for (let i = 1; i <= n; i++) out.push({ key: `y${i}`, label: `y${i} (state)`, group: 'Neuron states' });
  for (let i = 1; i <= n; i++) out.push({ key: `I${i}`, label: `I${i} (input)`, group: 'Neuron inputs' });
  return out;
}

export function genomeSpecFor(s: WalkerState, ranges: GenomeRanges = defaultRanges): WalkerGenomeSpec {
  return { controller: s.controller, size: s.controller === 'perfect' ? 0 : s.circuit.size, ranges };
}

export const leggedAgent: AgentModule<WalkerState, WalkerEvoConfig> = {
  id: 'walker',
  name: 'One-legged walker',
  citation: 'Beer & Gallagher (1992); Beer, Chiel & Gallagher (1999). Port of LeggedAgent.cpp.',

  defaultParams: () => ({
    controller: 'cpg',
    circuit: structuredClone(beerCpg),
    sensorWeights: new Array(5).fill(0),
    body: { ...defaultBody },
    run: { ...defaultRun, duration: 200 },
  }),

  presets: [
    {
      name: "Beer's cpg.ns (5-neuron CPG)",
      description: 'The evolved walker shipped with EvolutionaryAgents v1.2.',
      params: () => ({
        controller: 'cpg', circuit: structuredClone(beerCpg), sensorWeights: new Array(5).fill(0),
        body: { ...defaultBody }, run: { ...defaultRun, duration: 200 },
      }),
    },
    {
      name: 'PerfectStep (optimal)',
      description: 'The hand-coded optimal pattern generator.',
      params: () => ({
        controller: 'perfect', circuit: blankCircuit(0), sensorWeights: [],
        body: { ...defaultBody }, run: { ...defaultRun, duration: 200 },
      }),
    },
    // Generated with scripts/evolve.ts (population 96, 250 generations, default ranges, trial length 220)
    ...(evolvedPresets as { name: string; controller: ControllerKind; seed: number; fitness: number; circuit: CTRNNParams; sensorWeights: number[] }[]).map((p) => ({
      name: `${p.name} (${p.fitness.toFixed(3)})`,
      description: `Evolved by this site's TSearch port, seed ${p.seed}.`,
      params: (): WalkerState => ({
        controller: p.controller, circuit: structuredClone(p.circuit), sensorWeights: p.sensorWeights.slice(),
        body: { ...defaultBody }, run: { ...defaultRun, duration: 220 },
      }),
    })),
  ],

  simulate: (s) => simulateWalker(s, s.run),

  channels: (s) => [
    { key: 'angle', label: 'Leg angle (rad)', group: 'Body', range: [s.body.backwardAngleLimit, s.body.forwardAngleLimit] },
    { key: 'omega', label: 'Leg angular velocity', group: 'Body' },
    { key: 'footState', label: 'Foot state (1 = down)', group: 'Body', range: [0, 1] },
    { key: 'vx', label: 'Body velocity', group: 'Body' },
    { key: 'cx', label: 'Body position', group: 'Body' },
    { key: 'forwardForce', label: 'Forward force', group: 'Body' },
    { key: 'backwardForce', label: 'Backward force', group: 'Body' },
    ...neuronChannels(s.controller === 'perfect' ? 0 : s.circuit.size),
  ],

  circuitView: (s) =>
    s.controller === 'perfect' || s.circuit.size === 0
      ? null
      : { circuit: s.circuit, outputKey: (i) => `o${i + 1}`, stateKey: (i) => `y${i + 1}`, inputKey: (i) => `I${i + 1}` },

  inputSweep: (s) => {
    const lim = s.body.forwardAngleLimit, n = s.circuit.size;
    const range: [number, number] = [s.body.backwardAngleLimit * 1.5, lim * 1.5];
    if (s.controller === 'sensor')
      return { label: 'leg angle (rad)', channel: 'angle', range, inputs: (a) => Array.from({ length: n }, (_, i) => s.sensorWeights[i] * (a / lim)) };
    if (s.controller === 'one')
      return { label: 'leg angle (rad)', channel: 'angle', range, inputs: (a) => Array.from({ length: n }, (_, i) => (i === 0 ? (a * 5.0) / lim : 0)) };
    return null;
  },

  defaultEvoConfig: (s) => ({
    spec: genomeSpecFor(s.controller === 'perfect' ? { ...s, controller: 'cpg', circuit: blankCircuit(5) } : s),
    run: { ...s.run, duration: 220 },
    body: { ...s.body },
  }),

  genomeSize: (e) => genomeSize(e.spec),

  decode: (g, e) => {
    const p = decodeGenome(g, e.spec, e.body);
    return { ...p, run: { ...e.run } };
  },

  evaluate: (g, e, rs) => evaluateWalker(decodeGenome(g, e.spec, e.body), e.run, rs),

  genomeLabels: (e) => {
    const n = e.spec.size, out: string[] = [];
    for (let i = 1; i <= n; i++) out.push(`τ${i}`);
    for (let i = 1; i <= n; i++) out.push(`θ${i}`);
    if (e.spec.ranges.gain) for (let i = 1; i <= n; i++) out.push(`g${i}`);
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) out.push(`w${i}→${j}`);
    if (e.spec.controller === 'sensor') for (let i = 1; i <= n; i++) out.push(`s${i}`);
    return out;
  },
};
