// Trial ensembles for information-theoretic analysis of the visual categorizer:
// many trials on a common time base (every trial lasts the same time, because the object
// falls from the same height at the same speed), with stimulus variables per trial.

import type { Ensemble } from '../../analysis/information';
import { CTRNN } from '../../core/ctrnn';
import { neuronName, runTrial, type VisualState } from '.';

export interface EnsembleOptions {
  /** Trials per shape; offsets evenly spaced over [-range, range] (an even count avoids offset 0). */
  perShape: number;
}

export function visualEnsemble(s: VisualState, o: EnsembleOptions): Ensemble {
  const n = s.circuit.size;
  const offsets = Array.from({ length: o.perShape }, (_, k) => (o.perShape === 1 ? 0 : -s.trials.range + (2 * s.trials.range * k) / (o.perShape - 1)));
  const shape: number[] = [], side: number[] = [], offsetBin: number[] = [];
  const relX: Float64Array[] = [];
  const outs: Float64Array[][] = Array.from({ length: n }, () => []);
  let t: number[] = [];
  for (const sh of ['circle', 'line'] as const)
    for (const offset of offsets) {
      const times: number[] = [], rel: number[] = [];
      const o: number[][] = Array.from({ length: n }, () => []);
      runTrial(CTRNN.fromParams(s.circuit), { shape: sh, offset, vy: s.trials.vy, size: s.trials.size }, s.dt, (a, obj, time) => {
        times.push(time);
        rel.push(a.cx - obj.cx);
        for (let i = 0; i < n; i++) o[i].push(a.nervousSystem.outputs[i]);
      });
      if (times.length > t.length) t = times;
      shape.push(sh === 'circle' ? 0 : 1);
      side.push(offset < 0 ? 0 : 1);
      const q = (offset + s.trials.range) / (2 * s.trials.range);
      offsetBin.push(Math.min(3, Math.floor(q * 4)));
      relX.push(Float64Array.from(rel));
      o.forEach((v, i) => outs[i].push(Float64Array.from(v)));
    }
  return {
    t: Float64Array.from(t),
    trials: shape.length,
    stimuli: [
      { key: 'shape', label: 'object shape (circle / line)', values: Int32Array.from(shape), categories: ['circle', 'line'] },
      { key: 'side', label: 'side the object starts on', values: Int32Array.from(side), categories: ['left', 'right'] },
      { key: 'offset', label: 'starting offset (4 groups)', values: Int32Array.from(offsetBin), categories: ['far left', 'near left', 'near right', 'far right'] },
    ],
    channels: [
      { key: 'relX', label: 'Δx (agent − object)', data: relX },
      ...outs.map((data, i) => ({ key: `o${i + 1}`, label: neuronName(i), range: [0, 1] as [number, number], data })),
    ],
  };
}
