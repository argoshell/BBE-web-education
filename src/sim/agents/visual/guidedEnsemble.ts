// Trial ensembles for information analysis of the visually guided tasks. Every trial lasts the
// same time (the object always falls from STARTHEIGHT at the same speed), so trials share a time base.

import type { Ensemble } from '../../analysis/information';
import { CTRNN } from '../../core/ctrnn';
import { BodySize } from './body';
import { CIRCUITSIZE, guidedNeuronName, runGuidedTrial, taskInfo, type GuidedState, type TrialGrid } from './guided';

/** The task's own grid, or a denser one (every integer position and size) over the same ranges. */
export function ensembleGrid(g: TrialGrid, dense: boolean): TrialGrid {
  return dense ? { ...g, posStep: 1, sizeStep: 1 } : g;
}

function quartile(v: number, lo: number, hi: number): number {
  return Math.max(0, Math.min(3, Math.floor(((v - lo) / (hi - lo + 1e-9)) * 4)));
}

/** Only the controller, task and step size matter (not the selected trial). */
export function guidedEnsemble(s: Pick<GuidedState, 'circuit' | 'sensorWeights' | 'task' | 'dt'>, grid: TrialGrid): Ensemble {
  const ns = CTRNN.fromParams(s.circuit), info = taskInfo[s.task];
  const category: number[] = [], sizeQ: number[] = [], posQ: number[] = [];
  const relX: Float64Array[] = [];
  const outs: Float64Array[][] = Array.from({ length: CIRCUITSIZE }, () => []);
  let t: number[] = [];
  let posLo = Infinity, posHi = -Infinity;
  for (let pos = grid.posMin; pos <= grid.posMax; pos += grid.posStep) if (pos !== 0) { posLo = Math.min(posLo, pos); posHi = Math.max(posHi, pos); }
  for (let pos = grid.posMin; pos <= grid.posMax; pos += grid.posStep) {
    if (pos === 0) continue;
    for (let size = grid.sizeMin; size <= grid.sizeMax; size += grid.sizeStep) {
      if (size === BodySize) continue;
      const times: number[] = [], rel: number[] = [];
      const o: number[][] = Array.from({ length: CIRCUITSIZE }, () => []);
      runGuidedTrial(s, { task: s.task, pos, size }, s.dt, (a, _y, time) => {
        times.push(time);
        rel.push(a.cx - pos);
        for (let i = 0; i < CIRCUITSIZE; i++) o[i].push(a.nervousSystem.outputs[i]);
      }, ns);
      if (times.length > t.length) t = times;
      category.push(size < BodySize ? 0 : 1);
      sizeQ.push(quartile(size, grid.sizeMin, grid.sizeMax));
      posQ.push(quartile(pos, posLo, posHi));
      relX.push(Float64Array.from(rel));
      o.forEach((v, i) => outs[i].push(Float64Array.from(v)));
    }
  }
  const what = s.task === 'size' ? 'circle diameter' : 'aperture width';
  return {
    t: Float64Array.from(t),
    trials: category.length,
    stimuli: [
      { key: 'category', label: `the required response (${info.small} / ${info.large})`, values: Int32Array.from(category), categories: [info.small, info.large] },
      { key: 'size', label: `${what} (4 groups)`, values: Int32Array.from(sizeQ), categories: ['smallest', 'small', 'large', 'largest'] },
      { key: 'pos', label: 'horizontal offset of the object (4 groups)', values: Int32Array.from(posQ), categories: ['nearest', 'near', 'far', 'farthest'] },
    ],
    channels: [
      { key: 'relX', label: 'Δx (agent − object)', data: relX },
      ...outs.map((data, i) => ({ key: `o${i + 1}`, label: guidedNeuronName(i), range: [0, 1] as [number, number], data })),
    ],
  };
}
