// Dynamical systems analysis of a CTRNN with fixed external inputs, modeled on the
// functionality of Beer's Dynamica package for Mathematica (reimplemented, not ported):
//  - equilibrium points with eigenvalues, stability (Stable / Unstable / Saddle / Nonhyperbolic)
//    and type (Node / Spiral / Mixed), classified as in Dynamica
//  - limit cycles by Newton shooting with a phase condition; period and Floquet multipliers
//  - equilibrium branches by pseudo-arclength continuation in one parameter, with fold
//    (saddle-node) and Hopf points detected along the way
//
//   tau_i dy_i/dt = -y_i + sum_j w_ji sigma(g_j (y_j + theta_j)) + I_i

import { sigmoid, type CTRNNParams } from '../core/ctrnn';
import { findEquilibria } from './equilibria';
import { eigenvalues, solveLinear, type Complex } from './linalg';

export type Stability = 'stable' | 'unstable' | 'saddle' | 'nonhyperbolic';
export type EPType = 'node' | 'spiral' | 'mixed';

const ZERO_TOL = 1e-7;

export function field(c: CTRNNParams, I: ArrayLike<number>, y: ArrayLike<number>, out: Float64Array = new Float64Array(c.size)): Float64Array {
  const n = c.size;
  const o = new Float64Array(n);
  for (let j = 0; j < n; j++) o[j] = sigmoid(c.gains[j] * (y[j] + c.biases[j]));
  for (let i = 0; i < n; i++) {
    let s = I[i];
    for (let j = 0; j < n; j++) s += c.weights[j * n + i] * o[j];
    out[i] = (s - y[i]) / c.taus[i];
  }
  return out;
}

export function jacobian(c: CTRNNParams, y: ArrayLike<number>): Float64Array {
  const n = c.size, J = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    const o = sigmoid(c.gains[j] * (y[j] + c.biases[j]));
    const d = c.gains[j] * o * (1 - o);
    for (let i = 0; i < n; i++) J[i * n + j] = (c.weights[j * n + i] * d - (i === j ? 1 : 0)) / c.taus[i];
  }
  return J;
}

export function outputsOf(c: CTRNNParams, y: ArrayLike<number>): Float64Array {
  return Float64Array.from({ length: c.size }, (_, j) => sigmoid(c.gains[j] * (y[j] + c.biases[j])));
}

/** Dynamica's EPStabilityFromEigenvalues. */
export function stabilityOf(ev: Complex[]): Stability {
  if (ev.some((e) => Math.abs(e.re) < ZERO_TOL)) return 'nonhyperbolic';
  if (ev.every((e) => e.re < 0)) return 'stable';
  if (ev.every((e) => e.re > 0)) return 'unstable';
  return 'saddle';
}

/** Dynamica's EPTypeFromEigenvalues. */
export function typeOf(ev: Complex[]): EPType {
  if (ev.every((e) => Math.abs(e.im) < ZERO_TOL)) return 'node';
  if (ev.every((e) => Math.abs(e.im) >= ZERO_TOL)) return 'spiral';
  return 'mixed';
}

export interface EquilibriumPoint {
  y: Float64Array;
  outputs: Float64Array;
  eigenvalues: Complex[];
  stability: Stability;
  type: EPType;
}

export function classifyEquilibrium(c: CTRNNParams, y: Float64Array): EquilibriumPoint {
  const ev = eigenvalues(jacobian(c, y), c.size);
  return { y, outputs: outputsOf(c, y), eigenvalues: ev, stability: stabilityOf(ev), type: typeOf(ev) };
}

/** All equilibrium points found (Newton from many starts), classified. */
export function equilibriumPoints(c: CTRNNParams, I: ArrayLike<number>, starts: Float64Array[] = [], tries = 32): EquilibriumPoint[] {
  return findEquilibria(c, I, starts, tries).map((e) => classifyEquilibrium(c, e.y));
}

// ------------------------------------------------------------------ integration

/** One RK4 step of the state. */
function rk4(c: CTRNNParams, I: ArrayLike<number>, y: Float64Array, h: number): Float64Array {
  const n = c.size;
  const k1 = field(c, I, y);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = y[i] + 0.5 * h * k1[i];
  const k2 = field(c, I, t);
  for (let i = 0; i < n; i++) t[i] = y[i] + 0.5 * h * k2[i];
  const k3 = field(c, I, t);
  for (let i = 0; i < n; i++) t[i] = y[i] + h * k3[i];
  const k4 = field(c, I, t);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}

/** Integrate state and variational equations dM/dt = J M over time T with ~h steps (RK4). */
function flowWithMonodromy(c: CTRNNParams, I: ArrayLike<number>, y0: Float64Array, T: number, h: number): { y: Float64Array; M: Float64Array } {
  const n = c.size, steps = Math.max(1, Math.ceil(T / h)), dt = T / steps;
  let y: Float64Array = y0.slice();
  let M: Float64Array = new Float64Array(n * n);
  for (let i = 0; i < n; i++) M[i * n + i] = 1;
  const deriv = (yy: Float64Array, MM: Float64Array): [Float64Array, Float64Array] => {
    const f = field(c, I, yy), J = jacobian(c, yy), dM = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += J[i * n + j] * MM[j * n + k];
      dM[i * n + k] = s;
    }
    return [f, dM];
  };
  const add = (a: Float64Array, b: Float64Array, s: number) => Float64Array.from(a, (v, i) => v + s * b[i]);
  for (let k = 0; k < steps; k++) {
    const [f1, m1] = deriv(y, M);
    const [f2, m2] = deriv(add(y, f1, dt / 2), add(M, m1, dt / 2));
    const [f3, m3] = deriv(add(y, f2, dt / 2), add(M, m2, dt / 2));
    const [f4, m4] = deriv(add(y, f3, dt), add(M, m3, dt));
    y = Float64Array.from(y, (v, i) => v + (dt / 6) * (f1[i] + 2 * f2[i] + 2 * f3[i] + f4[i]));
    M = Float64Array.from(M, (v, i) => v + (dt / 6) * (m1[i] + 2 * m2[i] + 2 * m3[i] + m4[i]));
  }
  return { y, M };
}

// ------------------------------------------------------------------ limit cycles

export interface LimitCycle {
  /** A point on the cycle. */
  y: Float64Array;
  period: number;
  /** Floquet multipliers (eigenvalues of the monodromy matrix), including the trivial one near 1. */
  multipliers: Complex[];
  stable: boolean;
  /** States sampled around one period. */
  trajectory: Float64Array[];
}

/**
 * Find a limit cycle starting near y0: integrate to settle, estimate the period from returns to a
 * Poincare section, then refine (x0, T) by Newton shooting with the phase condition
 * f(x_ref) . (x0 - x_ref) = 0. Returns null if no cycle is found (e.g. the flow settles to an equilibrium).
 */
export function findLimitCycle(c: CTRNNParams, I: ArrayLike<number>, y0: ArrayLike<number>, opts: { settle?: number; h?: number; maxPeriod?: number } = {}): LimitCycle | null {
  const n = c.size, h = opts.h ?? 0.01;
  let y: Float64Array = Float64Array.from(y0);
  const settle = opts.settle ?? 200;
  for (let t = 0; t < settle; t += h) y = rk4(c, I, y, h);
  // Poincare section through the current point, normal to the flow
  const ref = y.slice(), normal = field(c, I, ref);
  const nn = Math.hypot(...normal);
  if (nn < 1e-9) return null; // at an equilibrium
  const side = (p: Float64Array) => { let s = 0; for (let i = 0; i < n; i++) s += normal[i] * (p[i] - ref[i]); return s; };
  const maxT = opts.maxPeriod ?? 500;
  let t = 0, prev = 0, T0 = NaN;
  let p: Float64Array = y.slice();
  while (t < maxT) {
    const q = rk4(c, I, p, h);
    t += h;
    const s = side(q);
    if (t > 5 * h && prev < 0 && s >= 0) {
      // Linear interpolation of the crossing time
      T0 = t - h + (h * -prev) / (s - prev);
      break;
    }
    prev = s;
    p = q;
  }
  if (!Number.isFinite(T0)) return null;

  // Newton shooting on (x, T)
  let x = ref.slice(), T = T0;
  for (let it = 0; it < 30; it++) {
    const { y: xT, M } = flowWithMonodromy(c, I, x, T, h);
    const fT = field(c, I, xT);
    const res = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) res[i] = xT[i] - x[i];
    res[n] = side(x);
    const err = Math.hypot(...res);
    if (err < 1e-10) break;
    const A = new Float64Array((n + 1) * (n + 1));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i * (n + 1) + j] = M[i * n + j] - (i === j ? 1 : 0);
      A[i * (n + 1) + n] = fT[i];
    }
    for (let j = 0; j < n; j++) A[n * (n + 1) + j] = normal[j];
    const d = solveLinear(A, res, n + 1);
    if (!d) return null;
    for (let i = 0; i < n; i++) x[i] -= d[i];
    T -= d[n];
    if (!(T > 0) || !x.every(Number.isFinite)) return null;
  }
  const { y: xT, M } = flowWithMonodromy(c, I, x, T, h);
  let closure = 0;
  for (let i = 0; i < n; i++) closure = Math.max(closure, Math.abs(xT[i] - x[i]));
  if (closure > 1e-6) return null;
  // Exclude a degenerate "cycle" that is really an equilibrium
  const multipliers = eigenvalues(M, n).sort((a, b) => Math.hypot(b.re, b.im) - Math.hypot(a.re, a.im));
  // Remove the trivial multiplier (closest to 1) when judging stability
  let trivial = 0;
  multipliers.forEach((m, k) => { if (Math.hypot(m.re - 1, m.im) < Math.hypot(multipliers[trivial].re - 1, multipliers[trivial].im)) trivial = k; });
  const stable = multipliers.every((m, k) => k === trivial || Math.hypot(m.re, m.im) < 1);
  const samples = 200, trajectory: Float64Array[] = [];
  let q: Float64Array = x.slice();
  const dt = T / samples;
  for (let k = 0; k <= samples; k++) {
    trajectory.push(q.slice());
    const sub = Math.max(1, Math.ceil(dt / h));
    for (let s = 0; s < sub; s++) q = rk4(c, I, q, dt / sub);
  }
  return { y: x, period: T, multipliers, stable, trajectory };
}

// ------------------------------------------------------------------ continuation

export interface BranchPoint {
  lambda: number;
  y: Float64Array;
  outputs: Float64Array;
  stability: Stability;
  unstableCount: number;
}

export interface Bifurcation {
  kind: 'fold' | 'hopf';
  lambda: number;
  y: Float64Array;
  outputs: Float64Array;
}

export interface Branch {
  points: BranchPoint[];
  bifurcations: Bifurcation[];
}

/** A circuit family parameterized by one scalar (e.g. a bias, a weight, or an input). */
export interface ParamFamily {
  circuit: (lambda: number) => CTRNNParams;
  inputs: (lambda: number) => ArrayLike<number>;
}

function unstableCount(ev: Complex[]): number {
  return ev.filter((e) => e.re > 0).length;
}

function pointAt(fam: ParamFamily, lambda: number, y: Float64Array): BranchPoint {
  const c = fam.circuit(lambda);
  const ev = eigenvalues(jacobian(c, y), c.size);
  return { lambda, y: y.slice(), outputs: outputsOf(c, y), stability: stabilityOf(ev), unstableCount: unstableCount(ev) };
}

/** Residual F(y, lambda) and its Jacobian [F_y | F_lambda] (F_lambda by central differences). */
function augmented(fam: ParamFamily, y: Float64Array, lambda: number): { F: Float64Array; Jy: Float64Array; Fl: Float64Array } {
  const c = fam.circuit(lambda);
  const F = field(c, fam.inputs(lambda), y);
  const Jy = jacobian(c, y);
  const e = 1e-6 * Math.max(1, Math.abs(lambda));
  const Fp = field(fam.circuit(lambda + e), fam.inputs(lambda + e), y);
  const Fm = field(fam.circuit(lambda - e), fam.inputs(lambda - e), y);
  const Fl = Float64Array.from(Fp, (v, i) => (v - Fm[i]) / (2 * e));
  return { F, Jy, Fl };
}

/** Unit tangent of the solution curve at (y, lambda), oriented along `prev` if given. */
function tangent(fam: ParamFamily, y: Float64Array, lambda: number, prev?: Float64Array): Float64Array | null {
  const n = y.length;
  const { Jy, Fl } = augmented(fam, y, lambda);
  const A = new Float64Array((n + 1) * (n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i * (n + 1) + j] = Jy[i * n + j];
    A[i * (n + 1) + n] = Fl[i];
  }
  const p = prev ?? Float64Array.from({ length: n + 1 }, (_, i) => (i === n ? 1 : 0));
  for (let j = 0; j <= n; j++) A[n * (n + 1) + j] = p[j];
  const rhs = new Float64Array(n + 1);
  rhs[n] = 1;
  const t = solveLinear(A, rhs, n + 1);
  if (!t) return null;
  const norm = Math.hypot(...t);
  return t.map((v) => v / norm) as Float64Array;
}

/**
 * Follow the equilibrium branch through (y0, lambda0) in both directions by pseudo-arclength
 * continuation, until lambda leaves [lmin, lmax] or the step budget runs out.
 */
export function followEquilibriumBranch(fam: ParamFamily, y0: Float64Array, lambda0: number, lmin: number, lmax: number, opts: { step?: number; maxSteps?: number } = {}): Branch {
  const n = y0.length, h0 = opts.step ?? 0.05 * (lmax - lmin) / 10, maxSteps = opts.maxSteps ?? 4000;
  const runDir = (dir: number): BranchPoint[] => {
    const pts: BranchPoint[] = [];
    let y: Float64Array = y0.slice(), l = lambda0, h = h0;
    let t = tangent(fam, y, l);
    if (!t) return pts;
    if (dir < 0) t = t.map((v) => -v) as Float64Array;
    for (let k = 0; k < maxSteps; k++) {
      // Predictor
      let yp: Float64Array = Float64Array.from(y, (v, i) => v + h * t![i]);
      let lp = l + h * t![n];
      // Corrector: Newton on [F; t . (u - u_pred)] = 0
      let ok = false;
      for (let it = 0; it < 20; it++) {
        const { F, Jy, Fl } = augmented(fam, yp, lp);
        const A = new Float64Array((n + 1) * (n + 1)), r = new Float64Array(n + 1);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) A[i * (n + 1) + j] = Jy[i * n + j];
          A[i * (n + 1) + n] = Fl[i];
          r[i] = F[i];
        }
        for (let j = 0; j <= n; j++) A[n * (n + 1) + j] = t![j];
        r[n] = 0;
        const d = solveLinear(A, r, n + 1);
        if (!d) break;
        yp = Float64Array.from(yp, (v, i) => v - d[i]);
        lp -= d[n];
        if (Math.hypot(...d) < 1e-11) { ok = true; break; }
      }
      if (!ok || !yp.every(Number.isFinite)) {
        h /= 2;
        if (Math.abs(h) < 1e-6 * Math.abs(h0)) break;
        continue;
      }
      const tn = tangent(fam, yp, lp, t!);
      if (!tn) break;
      y = yp; l = lp; t = tn;
      pts.push(pointAt(fam, l, y));
      if (l < lmin || l > lmax || y.some((v) => Math.abs(v) > 1e3)) break;
      h = Math.min(h * 1.3, h0 * 4);
    }
    return pts;
  };
  const back = runDir(-1).reverse();
  const fwd = runDir(1);
  const points = [...back, pointAt(fam, lambda0, y0), ...fwd].filter((p) => p.lambda >= lmin - 1e-9 && p.lambda <= lmax + 1e-9);
  return { points, bifurcations: detectBifurcations(fam, points) };
}

/**
 * Bifurcations between consecutive branch points: a real eigenvalue crossing zero changes the
 * sign of det(J) (fold); a complex pair crossing the imaginary axis changes the number of
 * unstable eigenvalues by two without changing the sign of det(J) (Hopf). Each is then located
 * precisely by bisection on the corresponding test function along the branch.
 */
function detectBifurcations(fam: ParamFamily, pts: BranchPoint[]): Bifurcation[] {
  const out: Bifurcation[] = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (a.unstableCount === b.unstableCount) continue;
    const kind = Math.abs(a.unstableCount - b.unstableCount) === 2 && sameDetSign(fam, a, b) ? 'hopf' : 'fold';
    const loc = locateBifurcation(fam, a, b, kind);
    out.push({ kind, lambda: loc.lambda, y: loc.y, outputs: outputsOf(fam.circuit(loc.lambda), loc.y) });
  }
  return out;
}

function detJ(fam: ParamFamily, y: Float64Array, lambda: number): number {
  const ev = eigenvalues(jacobian(fam.circuit(lambda), y), y.length);
  let re = 1, im = 0;
  for (const e of ev) { const r = re * e.re - im * e.im; im = re * e.im + im * e.re; re = r; }
  return re;
}

/** Real part of the complex eigenvalue pair nearest the imaginary axis (Hopf test function). */
function hopfTest(fam: ParamFamily, y: Float64Array, lambda: number): number {
  const ev = eigenvalues(jacobian(fam.circuit(lambda), y), y.length).filter((e) => Math.abs(e.im) > 1e-9);
  if (ev.length === 0) return NaN;
  return ev.reduce((m, e) => (Math.abs(e.re) < Math.abs(m.re) ? e : m)).re;
}

/** Correct a point onto the branch, keeping it on the hyperplane through u0 orthogonal to dir. */
function correctOnPlane(fam: ParamFamily, y0: Float64Array, l0: number, dir: Float64Array): { y: Float64Array; lambda: number } | null {
  const n = y0.length;
  let y = y0.slice(), l = l0;
  for (let it = 0; it < 30; it++) {
    const { F, Jy, Fl } = augmented(fam, y, l);
    const A = new Float64Array((n + 1) * (n + 1)), r = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i * (n + 1) + j] = Jy[i * n + j];
      A[i * (n + 1) + n] = Fl[i];
      r[i] = F[i];
    }
    for (let j = 0; j <= n; j++) A[n * (n + 1) + j] = dir[j];
    let c = 0;
    for (let j = 0; j < n; j++) c += dir[j] * (y[j] - y0[j]);
    r[n] = c + dir[n] * (l - l0);
    const d = solveLinear(A, r, n + 1);
    if (!d) return null;
    for (let i = 0; i < n; i++) y[i] -= d[i];
    l -= d[n];
    if (Math.hypot(...d) < 1e-13) break;
  }
  return y.every(Number.isFinite) ? { y, lambda: l } : null;
}

function locateBifurcation(fam: ParamFamily, a: BranchPoint, b: BranchPoint, kind: 'fold' | 'hopf'): { y: Float64Array; lambda: number } {
  const n = a.y.length;
  const dir = Float64Array.from({ length: n + 1 }, (_, i) => (i < n ? b.y[i] - a.y[i] : b.lambda - a.lambda));
  const test = (p: { y: Float64Array; lambda: number }) => (kind === 'fold' ? detJ(fam, p.y, p.lambda) : hopfTest(fam, p.y, p.lambda));
  const at = (s: number) => {
    const y0 = Float64Array.from(a.y, (v, i) => v + s * (b.y[i] - a.y[i]));
    return correctOnPlane(fam, y0, a.lambda + s * (b.lambda - a.lambda), dir);
  };
  let lo = 0, hi = 1;
  let pLo = { y: a.y, lambda: a.lambda }, pHi = { y: b.y, lambda: b.lambda };
  let tLo = test(pLo);
  const tHi = test(pHi);
  if (!(Math.sign(tLo) !== Math.sign(tHi))) return { y: Float64Array.from(a.y, (v, i) => (v + b.y[i]) / 2), lambda: (a.lambda + b.lambda) / 2 };
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2, p = at(mid);
    if (!p) break;
    const t = test(p);
    if (!Number.isFinite(t)) break;
    if (Math.sign(t) === Math.sign(tLo)) { lo = mid; pLo = p; tLo = t; } else { hi = mid; pHi = p; }
    if (hi - lo < 1e-12) break;
  }
  return { y: Float64Array.from(pLo.y, (v, i) => (v + pHi.y[i]) / 2), lambda: (pLo.lambda + pHi.lambda) / 2 };
}

function sameDetSign(fam: ParamFamily, a: BranchPoint, b: BranchPoint): boolean {
  return Math.sign(detJ(fam, a.y, a.lambda)) === Math.sign(detJ(fam, b.y, b.lambda));
}

/** All equilibrium branches over [lmin, lmax]: start from every equilibrium found at a few lambda values. */
export function equilibriumBranches(fam: ParamFamily, lmin: number, lmax: number, opts: { seeds?: number; step?: number } = {}): Branch[] {
  const seeds = opts.seeds ?? 5, branches: Branch[] = [];
  const onBranch = (lambda: number, y: Float64Array) =>
    branches.some((b) => b.points.some((p, k) => {
      if (k === 0) return false;
      const q = b.points[k - 1];
      if ((lambda - q.lambda) * (lambda - p.lambda) > 0) return false;
      const s = Math.abs(p.lambda - q.lambda) > 1e-12 ? (lambda - q.lambda) / (p.lambda - q.lambda) : 0;
      return y.every((v, i) => Math.abs(v - (q.y[i] + s * (p.y[i] - q.y[i]))) < 1e-2 * (1 + Math.abs(v)));
    }));
  for (let s = 0; s < seeds; s++) {
    const lambda = lmin + ((lmax - lmin) * (s + 0.5)) / seeds;
    const c = fam.circuit(lambda);
    for (const e of findEquilibria(c, fam.inputs(lambda), [], 24, s + 1)) {
      if (onBranch(lambda, e.y)) continue;
      branches.push(followEquilibriumBranch(fam, e.y, lambda, lmin, lmax, { step: opts.step }));
    }
  }
  return branches;
}
