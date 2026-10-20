// Equilibrium points of a full CTRNN with fixed external inputs, and how they change as
// one parameter (e.g. a sensed leg angle) varies.
//
// Equilibria satisfy y_i = sum_j w_ji sigma(g_j (y_j + theta_j)) + I_i. They are found by
// Newton's method from many starting points (plus continuation from the previous parameter
// value). Stability uses the Routh-Hurwitz criterion on the Jacobian's characteristic
// polynomial (Faddeev-LeVerrier), which is reliable for the small circuits used here.

import { sigmoid, type CTRNNParams } from '../core/ctrnn';
import { RandomState } from '../core/random';

export interface Equilibrium {
  y: Float64Array;
  outputs: Float64Array;
  stable: boolean;
}

function residual(c: CTRNNParams, I: ArrayLike<number>, y: Float64Array, o: Float64Array, f: Float64Array) {
  const n = c.size;
  for (let j = 0; j < n; j++) o[j] = sigmoid(c.gains[j] * (y[j] + c.biases[j]));
  for (let i = 0; i < n; i++) {
    let s = I[i];
    for (let j = 0; j < n; j++) s += c.weights[j * n + i] * o[j];
    f[i] = (s - y[i]) / c.taus[i];
  }
}

/** Jacobian of dy/dt at y (row-major n x n). */
export function jacobian(c: CTRNNParams, y: ArrayLike<number>): Float64Array {
  const n = c.size, J = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    const o = sigmoid(c.gains[j] * (y[j] + c.biases[j]));
    const d = c.gains[j] * o * (1 - o);
    for (let i = 0; i < n; i++) J[i * n + j] = (c.weights[j * n + i] * d - (i === j ? 1 : 0)) / c.taus[i];
  }
  return J;
}

/** Solve A x = b in place (Gaussian elimination with partial pivoting). Returns false if singular. */
function solve(A: Float64Array, b: Float64Array, n: number): boolean {
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i * n + k]) > Math.abs(A[p * n + k])) p = i;
    if (Math.abs(A[p * n + k]) < 1e-14) return false;
    if (p !== k) {
      for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
      const t = b[k]; b[k] = b[p]; b[p] = t;
    }
    for (let i = k + 1; i < n; i++) {
      const m = A[i * n + k] / A[k * n + k];
      if (m === 0) continue;
      for (let j = k; j < n; j++) A[i * n + j] -= m * A[k * n + j];
      b[i] -= m * b[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * b[j];
    b[i] = s / A[i * n + i];
  }
  return true;
}

/** Characteristic polynomial coefficients [1, c1, ..., cn] of A (Faddeev-LeVerrier). */
export function charPoly(A: Float64Array, n: number): number[] {
  const coeffs = [1];
  let M = new Float64Array(n * n); // M_0 = 0
  for (let k = 1; k <= n; k++) {
    // M_k = A M_{k-1} + c_{k-1} I
    const AM = new Float64Array(n * n);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let l = 0; l < n; l++) s += A[i * n + l] * M[l * n + j];
        AM[i * n + j] = s + (i === j ? coeffs[k - 1] : 0);
      }
    M = AM;
    // c_k = -tr(A M_k) / k
    let tr = 0;
    for (let i = 0; i < n; i++) for (let l = 0; l < n; l++) tr += A[i * n + l] * M[l * n + i];
    coeffs.push(-tr / k);
  }
  return coeffs;
}

/** Routh-Hurwitz: true if all roots of the polynomial have negative real parts. */
export function hurwitzStable(p: number[]): boolean {
  const n = p.length - 1;
  if (n === 0) return true;
  if (p.some((c) => !(c > 0))) return false;
  let r0 = p.filter((_, i) => i % 2 === 0);
  let r1 = p.filter((_, i) => i % 2 === 1);
  for (let row = 0; row < n; row++) {
    if (r1.length === 0) break;
    if (!(r1[0] > 0)) return false;
    const next: number[] = [];
    for (let i = 0; i < r0.length - 1; i++) next.push(r0[i + 1] - (r0[0] / r1[0]) * (r1[i + 1] ?? 0));
    r0 = r1;
    r1 = next;
  }
  return true;
}

export function isStable(c: CTRNNParams, y: ArrayLike<number>): boolean {
  return hurwitzStable(charPoly(jacobian(c, y), c.size));
}

function newton(c: CTRNNParams, I: ArrayLike<number>, y: Float64Array): boolean {
  const n = c.size, o = new Float64Array(n), f = new Float64Array(n);
  for (let it = 0; it < 60; it++) {
    residual(c, I, y, o, f);
    let norm = 0;
    for (let i = 0; i < n; i++) norm += Math.abs(f[i]);
    if (norm < 1e-12) return true;
    const J = jacobian(c, y);
    const step = Float64Array.from(f);
    if (!solve(J, step, n)) return false;
    let big = 0;
    for (let i = 0; i < n; i++) {
      // Damp very large steps to stay in the basin
      big = Math.max(big, Math.abs(step[i]));
    }
    const scale = big > 10 ? 10 / big : 1;
    for (let i = 0; i < n; i++) y[i] -= scale * step[i];
    if (!y.every(Number.isFinite)) return false;
  }
  residual(c, I, y, o, f);
  return f.every((v) => Math.abs(v) < 1e-9);
}

/** All equilibria found from the given starting points plus random output-space guesses. */
export function findEquilibria(c: CTRNNParams, I: ArrayLike<number>, starts: Float64Array[] = [], randomStarts = 24, seed = 1): Equilibrium[] {
  const n = c.size, rs = new RandomState(seed);
  const guesses = starts.map((s) => s.slice());
  // Equilibria satisfy y = W^T o + I for some o in (0,1)^n
  for (let k = 0; k < randomStarts; k++) {
    const o = Float64Array.from({ length: n }, () => (k < 2 ? k : rs.uniformRandom(0, 1)));
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = I[i]; for (let j = 0; j < n; j++) s += c.weights[j * n + i] * o[j]; y[i] = s; }
    guesses.push(y);
  }
  const found: Equilibrium[] = [];
  for (const y of guesses) {
    if (!newton(c, I, y)) continue;
    if (found.some((e) => e.y.every((v, i) => Math.abs(v - y[i]) < 1e-6))) continue;
    const outputs = Float64Array.from(y, (v, j) => sigmoid(c.gains[j] * (v + c.biases[j])));
    found.push({ y, outputs, stable: isStable(c, y) });
  }
  return found;
}

export interface BranchPoint {
  param: number;
  eq: Equilibrium;
}

/** Equilibria over a sweep of a parameter that sets the external inputs. */
export function sweepEquilibria(c: CTRNNParams, inputs: (v: number) => number[], range: [number, number], steps = 120): BranchPoint[] {
  const out: BranchPoint[] = [];
  let prev: Float64Array[] = [];
  for (let k = 0; k <= steps; k++) {
    const v = range[0] + ((range[1] - range[0]) * k) / steps;
    const eqs = findEquilibria(c, inputs(v), prev, 16, k + 1);
    for (const eq of eqs) out.push({ param: v, eq });
    prev = eqs.map((e) => e.y);
  }
  return out;
}
