import { CTRNN } from '../../src/sim/core/ctrnn';
const A2 = { n: 5, w: [[9.6712, 1.8562, 4.3859, -0.6227, -0.7912], [-5.1801, -2.4098, -3.5321, 8.8119, -9.9244], [-6.5417, 9.3668, 1.305, 9.7333, -5.981],
  [7.0174, 5.7888, -9.9125, -4.5742, -8.5561], [8.3435, -9.2429, 2.8769, -4.9563, 5.2326]],
  T: [-2.8401, 5.5182, 5.5025, -1.3114, 9.3223], F: [-7.6829, -1.5416, 4.2153, 3.9677, 7.6002], th: [-4.8178, -4.4765, -9.944, -0.7085, -5.2138], tau: [1.763, 16.9439, 1.5663, 73.9571, 1.0663] };
const c = A2, dt = 0.01, delay = Number(process.argv[2] ?? 20);
const phi = (u: number) => Math.exp(-((u - 5) ** 2) / 5.12) / 4.0034;
const N = 11;
let line = '      test→ ' + Array.from({ length: N }, (_, j) => (1 + j / (N - 1)).toFixed(1).padStart(4)).join('');
console.log(line);
for (let a = 0; a < N; a++) {
  const p = 1 + a / (N - 1); let row = `pair ${p.toFixed(1)}   `;
  for (let b = 0; b < N; b++) {
    const test = 1 + b / (N - 1);
    const ns = new CTRNN(); ns.setCircuitSize(5);
    for (let i = 0; i < 5; i++) { ns.setNeuronTimeConstant(i, c.tau[i]); ns.biases[i] = c.th[i]; }
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) ns.setWeight(x, y, c.w[x][y]);
    for (let i = 0; i < 5; i++) { ns.states[i] = 0; ns.outputs[i] = 1 / (1 + Math.exp(-(c.th[i]))); }
    const run = (d: number, T: number, F: number, f?: (t: number) => void) => { for (let t = 0; t < d - 1e-9; t += dt) { for (let i = 0; i < 5; i++) ns.externalInputs[i] = c.T[i] * T + c.F[i] * F; ns.eulerStep(dt); f?.(t + dt); } };
    run(20, p, 1); run(delay, 0, 0); run(10, test, 0);
    let m = 0; run(10, 0, 0, (t) => { m += ns.outputs[0] * phi(t) * dt; });
    row += m.toFixed(2).padStart(5).slice(1).padStart(4);
  }
  console.log(row);
}
