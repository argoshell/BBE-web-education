import { CTRNN } from '../../src/sim/core/ctrnn';
import { RandomState } from '../../src/sim/core/random';
const A1 = { n: 3, w: [[9.7529, 1.1023, -9.1226], [-5.2143, 2.2904, -1.7911], [-9.7031, -9.2973, 5.5012]],
  T: [-2.6291, -8.7298, -7.7723], F: [0.4719, 4.052, -9.9976], th: [2.9464, 6.4924, 7.3431], tau: [1.2145, 27.8472, 1.0256] };
const c = A1;
const phi = (u: number) => Math.exp(-((u - 5) ** 2) / 5.12) / 4.0034;
const rs = new RandomState(3);
const stats: Record<string, [number, number]> = {};
for (let r = 0; r < 400; r++) {
  const ns = new CTRNN(); ns.setCircuitSize(3);
  for (let i = 0; i < 3; i++) { ns.setNeuronTimeConstant(i, c.tau[i]); ns.biases[i] = c.th[i]; }
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) ns.setWeight(a, b, c.w[a][b]);
  ns.randomizeCircuitState(0, 0, rs);
  const run = (d: number, T: number, F: number, f?: (t: number) => void) => { for (let t = 0; t < d - 1e-9; t += 0.1) { for (let i = 0; i < 3; i++) ns.externalInputs[i] = c.T[i] * T + c.F[i] * F; ns.eulerStep(0.1); f?.(t + 0.1); } };
  let prev = 0;
  for (let l = 0; l < 2; l++) {
    const p = rs.uniformRandom(0, 1) < 0.5 ? 1 : 2;
    run(20, p, 1); run(rs.uniformRandom(16, 24), 0, 0);
    for (let k = 0; k < 3; k++) {
      const test = rs.uniformRandom(0, 1) < 0.5 ? p : (rs.uniformRandom(0, 1) < 0.5 ? 1 : 2);
      const same = test === p;
      run(10, test, 0); let e = 0;
      run(10, 0, 0, (t) => { e += Math.abs((same ? 1 : 0) - ns.outputs[0]) * phi(t) * 0.1; });
      const key = `l${l} k${k} env${l === 0 ? p : `${prev}->${p}`} ${same ? 'same' : 'diff'}`;
      stats[key] = stats[key] ?? [0, 0]; stats[key][0] += e; stats[key][1]++;
      run(rs.uniformRandom(8, 12), 0, 0); run(10, 0, e < 0.5 ? 1 : -1); run(rs.uniformRandom(8, 12), 0, 0);
    }
    prev = p;
  }
}
for (const k of Object.keys(stats).sort()) console.log(k, (stats[k][0] / stats[k][1]).toFixed(4), stats[k][1]);
