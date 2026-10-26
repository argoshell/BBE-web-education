// Worst-case distance from Dynamica's fold-curve points to the site's fold curves, and Hopf check.
import { readFileSync } from 'node:fs';
import { bifurcationCurves } from '../../src/sim/analysis/bifurcation2';
const ref = JSON.parse(readFileSync('tests/fixtures/dynamica.json', 'utf8'));
const base = { size: 2, ...ref.oscillator.circuit };
const t0 = performance.now();
const r = bifurcationCurves({ circuit: (a, b) => ({ ...base, biases: [a, b] }), inputs: () => [0, 0] }, { l1: [-8, 4], l2: [-8, 4] });
const t = (performance.now() - t0) / 1000;
const dist = (kind: string, l1: number, l2: number) => Math.min(...r.curves.filter((c) => c.kind === kind).flatMap((c) => c.points.slice(1).map((p, k) => {
  const q = c.points[k], dx = p.l1 - q.l1, dy = p.l2 - q.l2, L = dx * dx + dy * dy;
  const s = L > 0 ? Math.max(0, Math.min(1, ((l1 - q.l1) * dx + (l2 - q.l2) * dy) / L)) : 0;
  return Math.hypot(l1 - (q.l1 + s * dx), l2 - (q.l2 + s * dy));
})));
let worst = 0;
for (const c of ref.oscillatorBifurcationCurves) for (const p of c.points) worst = Math.max(worst, dist('fold', p[2], p[3]));
console.log('time', t.toFixed(2), 's; worst fold distance', worst.toExponential(2), '; hopf distances', ref.oscillatorBranches.bifurcations.map((b: { parameters: number[] }) => dist('hopf', b.parameters[0], -1.75).toExponential(2)).join(', '), '; codim2', r.codim2.length);
