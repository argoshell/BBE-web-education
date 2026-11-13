// Calibrates unstated details of Izquierdo, Harvey & Beer (2008) against their published circuits (Tables A1, A2).
import { CTRNN } from '../../src/sim/core/ctrnn';
import { RandomState } from '../../src/sim/core/random';

const A1 = { n: 3, w: [[9.7529, 1.1023, -9.1226], [-5.2143, 2.2904, -1.7911], [-9.7031, -9.2973, 5.5012]],
  T: [-2.6291, -8.7298, -7.7723], F: [0.4719, 4.052, -9.9976], th: [2.9464, 6.4924, 7.3431], tau: [1.2145, 27.8472, 1.0256] };
const A2 = { n: 5, w: [[9.6712, 1.8562, 4.3859, -0.6227, -0.7912], [-5.1801, -2.4098, -3.5321, 8.8119, -9.9244], [-6.5417, 9.3668, 1.305, 9.7333, -5.981],
  [7.0174, 5.7888, -9.9125, -4.5742, -8.5561], [8.3435, -9.2429, 2.8769, -4.9563, 5.2326]],
  T: [-2.8401, 5.5182, 5.5025, -1.3114, 9.3223], F: [-7.6829, -1.5416, 4.2153, 3.9677, 7.6002], th: [-4.8178, -4.4765, -9.944, -0.7085, -5.2138], tau: [1.763, 16.9439, 1.5663, 73.9571, 1.0663] };

type C = typeof A1;
interface Opt { decideByError?: boolean; rowIsSource: boolean; rPos: number; rNeg: number; rDur: number; continuum: boolean; L: number; K: [number, number]; dt: number; }

function make(c: C, o: Opt) {
  const ns = new CTRNN(); ns.setCircuitSize(c.n);
  for (let i = 0; i < c.n; i++) { ns.setNeuronTimeConstant(i, c.tau[i]); ns.biases[i] = c.th[i]; ns.gains[i] = 1; }
  for (let a = 0; a < c.n; a++) for (let b = 0; b < c.n; b++) ns.setWeight(o.rowIsSource ? a : b, o.rowIsSource ? b : a, c.w[a][b]);
  return ns;
}
const phi = (u: number) => Math.exp(-((u - 5) ** 2) / 5.12) / 4.0034;

function trial(c: C, o: Opt, rs: RandomState): { err: number; n: number } {
  const ns = make(c, o);
  ns.randomizeCircuitState(0, 0, rs);
  const run = (dur: number, T: number, F: number, f?: (t: number) => void) => {
    for (let t = 0; t < dur - 1e-9; t += o.dt) {
      for (let i = 0; i < c.n; i++) ns.externalInputs[i] = c.T[i] * T + c.F[i] * F;
      ns.eulerStep(o.dt); f?.(t + o.dt);
    }
  };
  const temp = () => (o.continuum ? rs.uniformRandom(1, 2) : rs.uniformRandom(0, 1) < 0.5 ? 1 : 2);
  let err = 0, n = 0;
  for (let l = 0; l < o.L; l++) {
    const p = temp();
    run(20, p, 1); run(rs.uniformRandom(16, 24), 0, 0);
    const K = o.K[0] + Math.floor(rs.uniformRandom(0, 1) * (o.K[1] - o.K[0] + 1));
    for (let k = 0; k < K; k++) {
      let test = rs.uniformRandom(0, 1) < 0.5 ? p : temp();
      const same = Math.abs(test - p) < 1e-12;
      const counts = same || Math.abs(test - p) >= 0.1;
      run(10, test, 0);
      let e = 0;
      run(10, 0, 0, (t) => { e += Math.abs((same ? 1 : 0) - ns.outputs[0]) * phi(t) * o.dt; });
      if (counts) { err += e; n++; }
      run(rs.uniformRandom(8, 12), 0, 0);
      const correct = o.decideByError ? e < 0.5 : (ns.outputs[0] > 0.5) === same;
      run(o.rDur, 0, correct ? o.rPos : o.rNeg);
      run(rs.uniformRandom(8, 12), 0, 0);
    }
  }
  return { err, n };
}

function fitness(c: C, o: Opt, R: number, seed = 1) {
  const rs = new RandomState(seed); let e = 0, n = 0;
  for (let r = 0; r < R; r++) { const x = trial(c, o, rs); e += x.err; n += x.n; }
  return 1 - e / n;
}
const base: Opt = { rowIsSource: true, rPos: 1, rNeg: -1, rDur: 10, continuum: false, L: 2, K: [3, 3], dt: 0.1 };
if (process.env.SWEEP) for (const [name, c, cont] of [['A1 discrete', A1, false], ['A2 continuum', A2, true]] as const)
  for (const rowIsSource of [true, false])
    for (const [rPos, rNeg] of [[1, -1], [1, 0]])
      for (const rDur of [5, 10, 20]) {
        const o = { ...base, rowIsSource, rPos, rNeg, rDur, continuum: cont };
        console.log(name, `rows=${rowIsSource ? 'source' : 'target'} r=${rPos}/${rNeg} dur=${rDur}`,
          'L2K3', fitness(c, o, 300).toFixed(4), 'L3K0-5', fitness(c, { ...o, L: 3, K: [0, 5] }, 300).toFixed(4));
      }
console.log('--- decide by error');
if (process.env.SWEEP) for (const [name, c, cont] of [['A1 discrete', A1, false], ['A2 continuum', A2, true]] as const)
  for (const [rPos, rNeg] of [[1, -1], [1, 0], [0, -1]])
    for (const rDur of [5, 10]) {
      const o = { ...base, decideByError: true, rPos, rNeg, rDur, continuum: cont };
      console.log(name, `r=${rPos}/${rNeg} dur=${rDur}`, 'L2K3', fitness(c, o, 300).toFixed(4), 'L3K0-5', fitness(c, { ...o, L: 3, K: [0, 5] }, 300).toFixed(4), 'L1K1', fitness(c, { ...o, L: 1, K: [1, 1] }, 300).toFixed(4));
    }
// Generalization as in the paper: six environments (five changes), up to 10 tests each, dt 0.01; fraction of tests answered correctly
function accuracy(c: C, o: Opt, R: number, seed = 5) {
  const rs = new RandomState(seed); let ok = 0, n = 0;
  const oo = { ...o, accuracy: true } as Opt & { accuracy: boolean };
  for (let r = 0; r < R; r++) { const x = trialAcc(c, oo, rs); ok += x.ok; n += x.n; }
  return ok / n;
}
function trialAcc(c: C, o: Opt, rs: RandomState) {
  const ns = make(c, o); ns.randomizeCircuitState(0, 0, rs);
  const run = (dur: number, T: number, F: number, f?: (t: number) => void) => {
    for (let t = 0; t < dur - 1e-9; t += o.dt) { for (let i = 0; i < c.n; i++) ns.externalInputs[i] = c.T[i] * T + c.F[i] * F; ns.eulerStep(o.dt); f?.(t + o.dt); }
  };
  const temp = () => (o.continuum ? rs.uniformRandom(1, 2) : rs.uniformRandom(0, 1) < 0.5 ? 1 : 2);
  let ok = 0, n = 0;
  for (let l = 0; l < o.L; l++) {
    const p = temp(); run(20, p, 1); run(rs.uniformRandom(16, 24), 0, 0);
    const K = o.K[0] + Math.floor(rs.uniformRandom(0, 1) * (o.K[1] - o.K[0] + 1));
    for (let k = 0; k < K; k++) {
      const test = (o as { randomTests?: boolean }).randomTests ? temp() : rs.uniformRandom(0, 1) < 0.5 ? p : o.continuum ? rs.uniformRandom(1, 2) : 3 - p;
      const same = test === p; run(10, test, 0); let e = 0;
      run(10, 0, 0, (t) => { e += Math.abs((same ? 1 : 0) - ns.outputs[0]) * phi(t) * o.dt; });
      if (same || Math.abs(test - p) >= 0.1) { n++; if (e < 0.5) ok++; }
      run(rs.uniformRandom(8, 12), 0, 0); run(o.rDur, 0, e < 0.5 ? o.rPos : o.rNeg); run(rs.uniformRandom(8, 12), 0, 0);
    }
  }
  return { ok, n };
}
console.log('--- generalization accuracy (paper: A1 98.36%, A2 95.77%)');
for (const [rPos, rNeg] of [[1, -1], [1, 0]])
  for (const K of [[1, 10], [0, 10], [10, 10]] as [number, number][]) {
    const o = { ...base, rPos, rNeg, rDur: 10, L: 6, K, dt: 0.01 };
    console.log(`r=${rPos}/${rNeg} K=${K}`, 'A1', accuracy(A1, o, 300).toFixed(4), 'A2', accuracy(A2, { ...o, continuum: true }, 300).toFixed(4));
  }
console.log('--- tests drawn at random from the full range');
for (const [rPos, rNeg] of [[1, -1], [1, 0]]) {
  const o = { ...base, rPos, rNeg, rDur: 10, L: 6, K: [1, 10] as [number, number], dt: 0.01, randomTests: true };
  console.log(`r=${rPos}/${rNeg}`, 'A1', accuracy(A1, o, 300).toFixed(4), 'A2', accuracy(A2, { ...o, continuum: true }, 300).toFixed(4));
}
