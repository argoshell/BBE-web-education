import { bialternate, bifurcationCurves } from '../../src/sim/analysis/bifurcation2';
import { determinant, eigenvalues } from '../../src/sim/analysis/linalg';
import { simpleOscillator } from '../../src/sim/agents/oscillator';
const A = Float64Array.from([1, 2, 0.5, -1, 3, 0.2, 0.7, -0.4, -2]);
const ev = eigenvalues(A, 3);
let pr = 1, pi = 0;
for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const sr = ev[i].re + ev[j].re, si = ev[i].im + ev[j].im; const r = pr * sr - pi * si; pi = pr * si + pi * sr; pr = r; }
console.log('det bialt', determinant(bialternate(A, 3), 3).toFixed(10), 'prod pair sums', pr.toFixed(10));
const t0 = performance.now();
const r = bifurcationCurves({ circuit: (a, b) => ({ ...simpleOscillator, biases: [a, b] }), inputs: () => [0, 0] }, { l1: [-8, 4], l2: [-8, 4] });
console.log('time', ((performance.now() - t0) / 1000).toFixed(2), 's; curves', r.curves.length, 'codim2', JSON.stringify(r.codim2.map((c) => [c.kind, +c.l1.toFixed(3), +c.l2.toFixed(3)])));
for (const c of r.curves) console.log(c.kind, c.points.length, 'pts; l1', Math.min(...c.points.map((p) => p.l1)).toFixed(3), Math.max(...c.points.map((p) => p.l1)).toFixed(3), 'l2', Math.min(...c.points.map((p) => p.l2)).toFixed(3), Math.max(...c.points.map((p) => p.l2)).toFixed(3), 'types', [...new Set(c.points.map((p) => p.type))].join(','));
