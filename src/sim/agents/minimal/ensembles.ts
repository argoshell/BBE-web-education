// Trial ensembles for information analysis of the minimally cognitive visual tasks (Williams & Beer 2010;
// Beer & Williams 2015). Trials of different lengths are aligned on fall progress, resampled to a fixed
// number of points per segment (nearest sample), as in the relational categorization ensemble.

import type { Ensemble } from '../../analysis/information';
import { CTRNN } from '../../core/ctrnn';
import { runFalls, type Fall, type TrialOptions } from './body';
import type { Body, MinimalController } from './common';
import { neuronName } from './network';
import { categorize, randomAttentionTrials, START_Y, attentionBody } from './attention';
import { memoryBody, MEMORY_START_Y, FALL_SPEED, randomMemoryTrials, type MemoryState } from './memory';
import { orientBody, ORIENT_START_Y, randomOrientTrials } from './orientation';

/** Rank-based groups of (nearly) equal size, so each grouping carries log2(groups) bits. */
export function rankGroups(values: number[], groups: number): Int32Array {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Int32Array(values.length);
  order.forEach(([, i], r) => { out[i] = Math.min(groups - 1, Math.floor((r * groups) / values.length)); });
  return out;
}

interface Sampled { segments: number[][][] }

/**
 * Run one trial, recording every neuron's output and each object's Δx (held at its landing value
 * afterwards). A new segment starts when an object lands, so segment k ends with the k-th landing.
 */
function sampleTrial(c: MinimalController, body: Body, falls: Fall[], dt: number, opts: TrialOptions = {}): Sampled {
  const ns = CTRNN.fromParams(c.circuit), n = c.circuit.size;
  const segments: number[][][] = [[]];
  const rel = falls.map(() => 0);
  let landed = 0;
  runFalls(ns, body.eye, body.velGain, falls, dt, opts, (a, objs, active) => {
    objs.forEach((o, k) => { if (active[k]) rel[k] = a.cx - o.cx; });
    segments[segments.length - 1].push([...Array.from(a.nervousSystem.outputs.subarray(0, n)), ...rel]);
    const nowLanded = active.filter((v) => !v).length;
    if (nowLanded > landed && nowLanded < falls.length) segments.push([]);
    landed = nowLanded;
  });
  return { segments };
}

function resample(seg: number[][], samples: number): number[][] {
  return Array.from({ length: samples }, (_, k) => seg[Math.min(seg.length - 1, Math.round((k / (samples - 1)) * (seg.length - 1)))]);
}

function build(c: MinimalController, runs: Sampled[], samples: number, objects: number, t: Float64Array,
  stimuli: Ensemble['stimuli'], relLabels: string[]): Ensemble {
  const n = c.circuit.size, nch = n + objects;
  const data: Float64Array[][] = Array.from({ length: nch }, () => []);
  for (const r of runs) {
    const rows = r.segments.flatMap((seg) => resample(seg, samples));
    for (let ch = 0; ch < nch; ch++) data[ch].push(Float64Array.from(rows, (row) => row[ch]));
  }
  return {
    t,
    trials: runs.length,
    stimuli,
    channels: [
      ...Array.from({ length: n }, (_, i) => ({ key: `o${i + 1}`, label: neuronName(c.arch, i), range: [0, 1] as [number, number], data: data[i] })),
      ...relLabels.map((label, k) => ({ key: `relX${k + 1}`, label, data: data[n + k] })),
    ],
  };
}

const progress = (samples: number, segments = 1) => Float64Array.from({ length: samples * segments }, (_, k) => Math.floor(k / samples) + (k % samples) / (samples - 1));

// ---------------------------------------------------------------- orientation

export function orientationEnsemble(c: MinimalController, count: number, dt: number, samples = 120): Ensemble {
  const trials = randomOrientTrials(count, 4242);
  const runs = trials.map((t) => sampleTrial(c, orientBody, [{ x: t.x, vx: t.vx, vy: t.vy, y: ORIENT_START_Y }], dt));
  const landing = trials.map((t) => Math.max(-200, Math.min(200, t.x + t.vx * ((ORIENT_START_Y - 15) / -t.vy))));
  return build(c, runs, samples, 1, progress(samples), [
    { key: 'landing', label: 'where the object will land (4 groups)', values: rankGroups(landing, 4), categories: ['far left', 'left', 'right', 'far right'] },
    { key: 'side', label: 'which side the object starts on', values: Int32Array.from(trials, (t) => (t.x < 0 ? 0 : 1)), categories: ['left', 'right'] },
    { key: 'vx', label: 'horizontal velocity (4 groups)', values: rankGroups(trials.map((t) => t.vx), 4), categories: ['fast left', 'left', 'right', 'fast right'] },
    { key: 'vy', label: 'fall speed (slow / fast half)', values: rankGroups(trials.map((t) => -t.vy), 2), categories: ['slow', 'fast'] },
  ], ['Δx (agent − object)']);
}

// ---------------------------------------------------------------- delayed response

export function memoryEnsemble(s: MemoryState, count: number): Ensemble {
  const trials = randomMemoryTrials(s.task, count, 5150);
  const runs = trials.map((t) => sampleTrial(s, memoryBody, [{ x: t.x, vx: t.vx, vy: -FALL_SPEED, y: MEMORY_START_Y }], s.dt, { blindAfter: s.blindAfter }));
  // Every trial lasts the same time, so keep real time (one sample per step)
  const len = Math.min(...runs.map((r) => r.segments[0].length));
  const t = Float64Array.from({ length: len }, (_, k) => k * s.dt);
  const T = (MEMORY_START_Y - 15) / FALL_SPEED;
  const stimuli: Ensemble['stimuli'] = [
    { key: 'landing', label: 'where the object will land (4 groups)', values: rankGroups(trials.map((x) => x.x + x.vx * T), 4), categories: ['far left', 'left', 'right', 'far right'] },
    { key: 'side', label: 'which side the object starts on', values: Int32Array.from(trials, (x) => (x.x < 0 ? 0 : 1)), categories: ['left', 'right'] },
  ];
  if (s.task === 'diagonal')
    stimuli.push({ key: 'vx', label: 'horizontal drift (4 groups)', values: rankGroups(trials.map((x) => x.vx), 4), categories: ['fast left', 'left', 'right', 'fast right'] });
  const n = s.circuit.size;
  return {
    t, trials: runs.length, stimuli,
    channels: [
      ...Array.from({ length: n }, (_, i) => ({ key: `o${i + 1}`, label: neuronName(s.arch, i), range: [0, 1] as [number, number], data: runs.map((r) => Float64Array.from(r.segments[0].slice(0, len), (row) => row[i])) })),
      { key: 'relX1', label: 'Δx (agent − object)', data: runs.map((r) => Float64Array.from(r.segments[0].slice(0, len), (row) => row[n])) },
    ],
  };
}

// ---------------------------------------------------------------- selective attention

export function attentionEnsemble(c: MinimalController, count: number, dt: number, samples = 100): Ensemble {
  const trials = randomAttentionTrials(count, 909);
  const runs = trials.map((t) => sampleTrial(c, attentionBody, [{ x: t.x1, vx: t.vx1, vy: -t.vy1, y: START_Y }, { x: t.x2, vx: t.vx2, vy: -t.vy2, y: START_Y }], dt));
  const land = (x: number, vx: number, vy: number) => Math.max(-200, Math.min(200, x + vx * ((START_Y - 15) / vy)));
  const cats = trials.map(categorize);
  return build(c, runs, samples, 2, progress(samples, 2), [
    { key: 'second', label: 'where the slow object lands, relative to the fast one', values: Int32Array.from(trials, (t) => (land(t.x2, t.vx2, t.vy2) < land(t.x1, t.vx1, t.vy1) ? 0 : 1)), categories: ['to the left', 'to the right'] },
    { key: 'first', label: 'where the fast object lands (4 groups)', values: rankGroups(trials.map((t) => land(t.x1, t.vx1, t.vy1)), 4), categories: ['far left', 'left', 'right', 'far right'] },
    { key: 'po', label: 'which object lands first (passing objects)', values: Int32Array.from(cats, (k) => (k.po ? 1 : 0)), categories: ['the nearer one', 'the farther one'] },
    { key: 'op', label: 'whether the slow object is out of view at the first catch', values: Int32Array.from(cats, (k) => (k.op ? 1 : 0)), categories: ['in view', 'out of view'] },
  ], ['Δx fast object', 'Δx slow object']);
}
