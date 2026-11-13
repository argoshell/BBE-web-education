// Shared simulation, recording and views for the minimally cognitive visual tasks.

import type { CircuitView } from '../../agent';
import { CTRNN, type CTRNNParams } from '../../core/ctrnn';
import { Recorder, type ChannelSpec, type Recording } from '../../core/recording';
import { runFalls, type Eye, type Fall, type TrialOptions, type TrialOutcome } from './body';
import { colorSlot, neuronName, type Arch } from './network';

export interface MinimalController {
  arch: Arch;
  circuit: CTRNNParams;
}

export interface Body {
  eye: Eye;
  velGain: number;
}

function channelKeys(c: MinimalController, eye: Eye, objects: number): string[] {
  const keys = ['agentX', 'vx', 'blind'];
  for (let k = 1; k <= objects; k++) keys.push(`ox${k}`, `oy${k}`, `relX${k}`, `seen${k}`, `act${k}`);
  for (let r = 1; r <= eye.rays; r++) keys.push(`ray${r}`);
  for (let i = 1; i <= c.circuit.size; i++) keys.push(`o${i}`, `y${i}`, `I${i}`);
  return keys;
}

/** Simulate one trial with full recording. A landed object stays where it landed (act = 0); relX is NaN after landing. */
export function recordFalls(c: MinimalController, body: Body, falls: Fall[], dt: number, opts: TrialOptions = {}): { rec: Recording; out: TrialOutcome } {
  const rec = new Recorder(channelKeys(c, body.eye, falls.length));
  const n = c.circuit.size;
  const landed = falls.map(() => false);
  const out = runFalls(CTRNN.fromParams(c.circuit), body.eye, body.velGain, falls, dt, opts, (a, objs, active, t) => {
    const v: Record<string, number> = { agentX: a.cx, vx: a.vx, blind: a.blind ? 1 : 0 };
    const live = objs.filter((_, k) => active[k]);
    objs.forEach((o, k) => {
      const landing = !active[k] && !landed[k];
      v[`ox${k + 1}`] = o.cx;
      v[`oy${k + 1}`] = o.cy;
      v[`relX${k + 1}`] = active[k] || landing ? a.cx - o.cx : NaN;
      v[`seen${k + 1}`] = active[k] && a.sees(o) ? 1 : 0;
      v[`act${k + 1}`] = active[k] ? 1 : 0;
      if (landing) landed[k] = true;
    });
    a.rayLengths(live).forEach((len, r) => { v[`ray${r + 1}`] = len; });
    const ns = a.nervousSystem;
    for (let i = 0; i < n; i++) { v[`o${i + 1}`] = ns.outputs[i]; v[`y${i + 1}`] = ns.states[i]; v[`I${i + 1}`] = ns.externalInputs[i]; }
    rec.push(t, v);
  });
  return { rec: rec.finish(), out };
}

export function minimalChannels(c: MinimalController, eye: Eye, objects: number): ChannelSpec[] {
  const out: ChannelSpec[] = [
    { key: 'agentX', label: 'agent x', group: 'Body' },
    { key: 'vx', label: 'agent velocity', group: 'Body' },
  ];
  for (let k = 1; k <= objects; k++) out.push({ key: `relX${k}`, label: objects > 1 ? `agent x − object ${k} x` : 'agent x − object x', group: 'Body' });
  for (let r = 1; r <= eye.rays; r++) out.push({ key: `ray${r}`, label: `ray ${r} length`, group: 'Rays' });
  const n = c.circuit.size, nm = (i: number) => neuronName(c.arch, i);
  for (let i = 0; i < n; i++) out.push({ key: `o${i + 1}`, label: `${nm(i)} output`, group: 'Neuron outputs', range: [0, 1] });
  for (let i = 0; i < n; i++) out.push({ key: `y${i + 1}`, label: `${nm(i)} state`, group: 'Neuron states' });
  for (let i = 0; i < n; i++) out.push({ key: `I${i + 1}`, label: `${nm(i)} input`, group: 'Neuron inputs' });
  return out;
}

export function minimalCircuitView(c: MinimalController): CircuitView {
  return {
    circuit: c.circuit,
    outputKey: (i) => `o${i + 1}`,
    stateKey: (i) => `y${i + 1}`,
    inputKey: (i) => `I${i + 1}`,
    name: (i) => neuronName(c.arch, i),
    colorSlot: (i) => colorSlot(c.arch, i),
  };
}

/** Performance as a fraction of the papers' maximum of 200: (200 − mean error) / 200, floored at 0. */
export function performance(meanError: number): number {
  return Math.max(0, (200 - meanError) / 200);
}

export interface PathSample {
  /** Agent x and each object's x and height, sampled every few steps. */
  t: Float64Array;
  agentX: Float64Array;
  ox: Float64Array[];
  oy: Float64Array[];
}

/** Run a trial keeping only coarse paths (for overview plots). */
export function samplePaths(c: MinimalController, body: Body, falls: Fall[], dt: number, opts: TrialOptions = {}, every = 4): { paths: PathSample; out: TrialOutcome } {
  const t: number[] = [], ax: number[] = [];
  const ox: number[][] = falls.map(() => []), oy: number[][] = falls.map(() => []);
  let k = 0;
  const was = falls.map(() => true);
  const out = runFalls(CTRNN.fromParams(c.circuit), body.eye, body.velGain, falls, dt, opts, (a, objs, active, time) => {
    // Always keep the step on which an object lands
    const landing = active.some((v, j) => !v && was[j]);
    if (k++ % every !== 0 && !landing) return;
    t.push(time); ax.push(a.cx);
    objs.forEach((o, j) => { const show = active[j] || was[j]; ox[j].push(show ? o.cx : NaN); oy[j].push(show ? o.cy : NaN); was[j] = active[j]; });
  });
  return { paths: { t: Float64Array.from(t), agentX: Float64Array.from(ax), ox: ox.map((v) => Float64Array.from(v)), oy: oy.map((v) => Float64Array.from(v)) }, out };
}
