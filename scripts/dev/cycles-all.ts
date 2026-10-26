import { equilibriumBranches, type ParamFamily } from '../../src/sim/analysis/dynamics';
import { cycleBranches } from '../../src/sim/analysis/cycles';
import { simpleOscillator } from '../../src/sim/agents/oscillator';
const fam: ParamFamily = { circuit: (l) => ({ ...simpleOscillator, biases: [l, simpleOscillator.biases[1]] }), inputs: () => [0, 0] };
const t0 = performance.now();
const eq = equilibriumBranches(fam, -8, 4);
const t1 = performance.now();
const cb = cycleBranches(fam, -8, 4, eq, [0, 0]);
console.log('eq', ((t1 - t0) / 1000).toFixed(2), 's; cycles', ((performance.now() - t1) / 1000).toFixed(2), 's; branches', cb.length);
for (const b of cb) {
  const ls = b.points.map((p) => p.lambda);
  console.log(' points', b.points.length, 'lambda', Math.min(...ls).toFixed(4), '..', Math.max(...ls).toFixed(4), 'stable', b.points.filter((p) => p.stable).length, 'bifs', JSON.stringify(b.bifurcations));
}
