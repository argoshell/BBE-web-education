// Two-parameter bifurcation curves (the counterpart of Dynamica's BifurcationBranches /
// DisplayParameterChart): fold (saddle-node) and Hopf curves in a (lambda1, lambda2) plane,
// with codimension-2 points: cusps on fold curves and Bogdanov-Takens points where a Hopf
// curve meets a fold curve.
//
// Fold curve:  F(y; l1, l2) = 0,  det J = 0
// Hopf curve:  F(y; l1, l2) = 0,  det(2J (.) I) = 0   (bialternate product; its determinant is the
//              product of all pairwise eigenvalue sums, so it vanishes at Hopf points, and also on
//              "neutral saddles" with real eigenvalues mu and -mu, which are labelled separately)
// Each is a curve in (y, l1, l2) traced by pseudo-arclength continuation.

import type { CTRNNParams } from '../core/ctrnn';
import { equilibriumBranches, field, jacobian } from './dynamics';
import { determinant, eigenvalues, solveLinear } from './linalg';

export interface ParamFamily2 {
  circuit: (l1: number, l2: number) => CTRNNParams;
  inputs: (l1: number, l2: number) => ArrayLike<number>;
}

export interface CurvePoint {
  l1: number;
  l2: number;
  y: Float64Array;
  /** On Hopf curves: a true Hopf point (complex pair on the imaginary axis) or a neutral saddle. */
  type: 'fold' | 'hopf' | 'neutral';
}

export interface BifurcationCurve {
  kind: 'fold' | 'hopf';
  points: CurvePoint[];
}

export interface Codim2Point {
  kind: 'cusp' | 'bt';
  l1: number;
  l2: number;
}

/** The bialternate product 2A (.) I of an n x n matrix (size n(n-1)/2), after Kuznetsov. */
export function bialternate(A: ArrayLike<number>, n: number): Float64Array {
  const pairs: [number, number][] = [];
  for (let p = 1; p < n; p++) for (let q = 0; q < p; q++) pairs.push([p, q]);
  const m = pairs.length, B = new Float64Array(m * m);
  const a = (i: number, j: number) => A[i * n + j];
  pairs.forEach(([p, q], row) => pairs.forEach(([r, s], col) => {
    let v = 0;
    if (r === q) v = -a(p, s);
    else if (r !== p && s === q) v = a(p, r);
    else if (r === p && s === q) v = a(p, p) + a(q, q);
    else if (r === p && s !== q) v = a(q, s);
    else if (s === p) v = -a(q, r);
    B[row * m + col] = v;
  }));
  return B;
}

function testFn(kind: 'fold' | 'hopf', J: Float64Array, n: number): number {
  if (kind === 'fold') return determinant(J, n);
  const m = (n * (n - 1)) / 2;
  return m === 0 ? 1 : determinant(bialternate(J, n), m);
}

function pointType(kind: 'fold' | 'hopf', J: Float64Array, n: number): CurvePoint['type'] {
  if (kind === 'fold') return 'fold';
  // The eigenvalue pair whose sum is closest to zero decides Hopf vs neutral saddle
  const ev = eigenvalues(J, n);
  let best = Infinity, complex = false;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const s = Math.hypot(ev[i].re + ev[j].re, ev[i].im + ev[j].im);
      if (s < best) { best = s; complex = Math.abs(ev[i].im) > 1e-9 && Math.abs(ev[i].im + ev[j].im) < 1e-6; }
    }
  return complex ? 'hopf' : 'neutral';
}

/** Residual (n + 1) and its Jacobian (n + 1) x (n + 2) at u = (y, l1, l2), by finite differences for the test row and parameters. */
function system(fam: ParamFamily2, kind: 'fold' | 'hopf', u: Float64Array) {
  const n = u.length - 2, N = n + 2;
  const y = u.subarray(0, n), l1 = u[n], l2 = u[n + 1];
  const c = fam.circuit(l1, l2), I = fam.inputs(l1, l2);
  const F = field(c, I, y);
  const Jy = jacobian(c, y);
  const g = testFn(kind, Jy, n);
  const R = new Float64Array(n + 1), A = new Float64Array((n + 1) * N);
  for (let i = 0; i < n; i++) { R[i] = F[i]; for (let j = 0; j < n; j++) A[i * N + j] = Jy[i * n + j]; }
  R[n] = g;
  for (let k = 0; k < N; k++) {
    const e = 1e-6 * Math.max(1, Math.abs(u[k]));
    const up = u.slice(), um = u.slice();
    up[k] += e; um[k] -= e;
    const cp = fam.circuit(up[n], up[n + 1]), cm = fam.circuit(um[n], um[n + 1]);
    const yp = up.subarray(0, n), ym = um.subarray(0, n);
    if (k >= n) {
      const Fp = field(cp, fam.inputs(up[n], up[n + 1]), yp), Fm = field(cm, fam.inputs(um[n], um[n + 1]), ym);
      for (let i = 0; i < n; i++) A[i * N + k] = (Fp[i] - Fm[i]) / (2 * e);
    }
    A[n * N + k] = (testFn(kind, jacobian(cp, yp), n) - testFn(kind, jacobian(cm, ym), n)) / (2 * e);
  }
  return { R, A };
}

function tangent(A: Float64Array, N: number, prev: Float64Array): Float64Array | null {
  const M = new Float64Array(N * N);
  M.set(A);
  for (let j = 0; j < N; j++) M[(N - 1) * N + j] = prev[j];
  const rhs = new Float64Array(N);
  rhs[N - 1] = 1;
  const t = solveLinear(M, rhs, N);
  if (!t) return null;
  const nn = Math.hypot(...t);
  return t.map((v) => v / nn) as Float64Array;
}

/** Trace one bifurcation curve through a seed point in both directions within the box. */
export function followCurve(fam: ParamFamily2, kind: 'fold' | 'hopf', y0: ArrayLike<number>, l1: number, l2: number,
  box: { l1: [number, number]; l2: [number, number] }, opts: { step?: number; maxSteps?: number } = {}): BifurcationCurve {
  const n = y0.length, N = n + 2;
  const span = Math.max(box.l1[1] - box.l1[0], box.l2[1] - box.l2[0]);
  const h0 = opts.step ?? span / 80, maxSteps = opts.maxSteps ?? 600;
  const inBox = (u: Float64Array) => u[n] >= box.l1[0] && u[n] <= box.l1[1] && u[n + 1] >= box.l2[0] && u[n + 1] <= box.l2[1];
  const start = Float64Array.from([...Array.from(y0), l1, l2]);
  const runDir = (dir: number): Float64Array[] => {
    const pts: Float64Array[] = [];
    let u: Float64Array = start.slice(), step = h0;
    const s0 = system(fam, kind, u);
    let t = tangent(s0.A, N, Float64Array.from({ length: N }, (_, i) => (i === n ? dir : i === n + 1 ? 0.1 * dir : 0)));
    if (!t) return pts;
    for (let k = 0; k < maxSteps; k++) {
      let v: Float64Array = Float64Array.from(u, (val, i) => val + step * t![i]);
      let ok = false, lastA: Float64Array | null = null;
      for (let it = 0; it < 15; it++) {
        const { R, A } = system(fam, kind, v);
        const M = new Float64Array(N * N), r = new Float64Array(N);
        M.set(A);
        r.set(R);
        let arc = 0;
        for (let j = 0; j < N; j++) { M[(N - 1) * N + j] = t![j]; arc += t![j] * (v[j] - u[j]); }
        r[N - 1] = arc - step;
        const d = solveLinear(M, r, N);
        if (!d) break;
        v = Float64Array.from(v, (val, i) => val - d[i]);
        lastA = A;
        if (!v.every(Number.isFinite) || v.some((x) => Math.abs(x) > 1e3)) break;
        if (Math.hypot(...d) < 1e-10) { ok = true; break; }
      }
      if (!ok || !lastA) {
        step /= 2;
        if (step < h0 * 1e-3) break;
        continue;
      }
      const tn = tangent(lastA, N, t!);
      if (!tn) break;
      // Curvature control: resolve sharp turns (e.g. cusps) with smaller steps; compare the
      // tangents' directions in the parameter plane, which is what gets drawn
      const pa = Math.hypot(t![n], t![n + 1]), pb = Math.hypot(tn[n], tn[n + 1]);
      if (pa > 1e-9 && pb > 1e-9 && (t![n] * tn[n] + t![n + 1] * tn[n + 1]) / (pa * pb) < Math.cos(Math.PI / 18) && step > h0 * 0.02) {
        step /= 2;
        continue;
      }
      u = v;
      t = tn;
      pts.push(u.slice());
      if (!inBox(u)) break;
      // Closed curve: back near the start after going around
      if (pts.length > 20 && Math.hypot(u[n] - l1, u[n + 1] - l2) < 0.5 * h0) break;
      step = Math.min(step * 1.4, h0 * 3);
    }
    return pts;
  };
  const back = runDir(-1).reverse(), fwd = runDir(1);
  const all = [...back, start, ...fwd];
  const points = all.map((u) => {
    const y = u.slice(0, n), c = fam.circuit(u[n], u[n + 1]);
    return { l1: u[n], l2: u[n + 1], y, type: pointType(kind, jacobian(c, y), n) };
  });
  return { kind, points };
}

function nearCurve(curves: BifurcationCurve[], kind: 'fold' | 'hopf', l1: number, l2: number, tol: number): boolean {
  return curves.some((c) => c.kind === kind && c.points.some((p, k) => {
    if (k === 0) return false;
    const q = c.points[k - 1];
    // Distance from (l1, l2) to segment q-p
    const dx = p.l1 - q.l1, dy = p.l2 - q.l2, L = dx * dx + dy * dy;
    const s = L > 0 ? Math.max(0, Math.min(1, ((l1 - q.l1) * dx + (l2 - q.l2) * dy) / L)) : 0;
    return Math.hypot(l1 - (q.l1 + s * dx), l2 - (q.l2 + s * dy)) < tol;
  }));
}

/**
 * All fold and Hopf curves found in the box: seeds come from one-parameter equilibrium branches
 * along slices of the box (in both directions), then each seed's curve is traced.
 */
export function bifurcationCurves(fam: ParamFamily2, box: { l1: [number, number]; l2: [number, number] }, opts: { slices?: number } = {}):
  { curves: BifurcationCurve[]; codim2: Codim2Point[] } {
  const curves: BifurcationCurve[] = [];
  const S = opts.slices ?? 5;
  const tol = 0.02 * Math.max(box.l1[1] - box.l1[0], box.l2[1] - box.l2[0]);
  const seeds: { kind: 'fold' | 'hopf'; y: Float64Array; l1: number; l2: number }[] = [];
  for (let s = 0; s < S; s++) {
    const l2 = box.l2[0] + ((box.l2[1] - box.l2[0]) * (s + 0.5)) / S;
    for (const b of equilibriumBranches({ circuit: (l) => fam.circuit(l, l2), inputs: (l) => fam.inputs(l, l2) }, box.l1[0], box.l1[1], { seeds: 3 }))
      for (const bp of b.bifurcations) seeds.push({ kind: bp.kind, y: bp.y, l1: bp.lambda, l2 });
    const l1 = box.l1[0] + ((box.l1[1] - box.l1[0]) * (s + 0.5)) / S;
    for (const b of equilibriumBranches({ circuit: (l) => fam.circuit(l1, l), inputs: (l) => fam.inputs(l1, l) }, box.l2[0], box.l2[1], { seeds: 3 }))
      for (const bp of b.bifurcations) seeds.push({ kind: bp.kind, y: bp.y, l1, l2: bp.lambda });
  }
  for (const sd of seeds) {
    if (nearCurve(curves, sd.kind, sd.l1, sd.l2, tol)) continue;
    curves.push(followCurve(fam, sd.kind, sd.y, sd.l1, sd.l2, box));
  }
  return { curves, codim2: codim2Points(curves) };
}

function codim2Points(curves: BifurcationCurve[]): Codim2Point[] {
  const out: Codim2Point[] = [];
  for (const c of curves) {
    const p = c.points;
    if (c.kind === 'hopf') {
      // Bogdanov-Takens: the Hopf frequency goes to zero where the curve turns into a neutral saddle
      for (let k = 1; k < p.length; k++)
        if ((p[k - 1].type === 'hopf') !== (p[k].type === 'hopf'))
          out.push({ kind: 'bt', l1: (p[k - 1].l1 + p[k].l1) / 2, l2: (p[k - 1].l2 + p[k].l2) / 2 });
    } else {
      // Cusp: the fold curve reverses direction in the parameter plane
      for (let k = 1; k < p.length - 1; k++) {
        const ax = p[k].l1 - p[k - 1].l1, ay = p[k].l2 - p[k - 1].l2, bx = p[k + 1].l1 - p[k].l1, by = p[k + 1].l2 - p[k].l2;
        const na = Math.hypot(ax, ay), nb = Math.hypot(bx, by);
        if (na > 0 && nb > 0 && (ax * bx + ay * by) / (na * nb) < -0.5) out.push({ kind: 'cusp', l1: p[k].l1, l2: p[k].l2 });
      }
    }
  }
  return out;
}
