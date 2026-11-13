import { CTRNN } from '../../src/sim/core/ctrnn';
import { runFalls } from '../../src/sim/agents/minimal/body';
import { orientEvalTrials, orientEye } from '../../src/sim/agents/minimal/orientation';
const N = 7;
const c = { size: N, taus: new Array(N).fill(1), biases: [-5, -5, -5, -5, -5, -2.5, -2.5], gains: new Array(N).fill(1), weights: new Array(N * N).fill(0) };
const w = (f: number, t: number, v: number) => { c.weights[f * N + t] = v; };
// left rays (0,1) → M2 (index 6, pushes left); right rays (3,4) → M1 (index 5, pushes right)
w(0, 6, 8); w(1, 6, 5); w(3, 5, 5); w(4, 5, 8);
for (const t of orientEvalTrials) {
  const o = runFalls(CTRNN.fromParams(c), orientEye, 5, [{ x: t.x, vx: t.vx, vy: t.vy }], 0.1);
  console.log(t, 'dx', o.dx[0].toFixed(1), 'T', o.landT[0].toFixed(1));
}
