// Limit-cycle branches: pseudo-arclength continuation of periodic orbits in one parameter
// (the counterpart of Dynamica's FollowLimitCycleBranch), with folds of cycles, period
// doublings and Neimark-Sacker (torus) bifurcations flagged from the Floquet multipliers.
//
// Shooting equations in the unknowns (x, T, lambda):
//   phi_T(x; lambda) - x = 0          (the orbit closes after one period)
//   f(x_ref) . (x - x_ref) = 0        (phase condition, x_ref = previous point on the branch)

import type { CTRNNParams } from '../core/ctrnn';
import { field, findLimitCycle, Integrator, outputsOf, type Branch, type ParamFamily } from './dynamics';
import { eigenvalues, solveLinear, type Complex } from './linalg';

export interface CycleBranchPoint {
  lambda: number;
  period: number;
  /** A point on the cycle. */
  y: Float64Array;
  /** Minimum and maximum of each neuron's output around the cycle. */
  min: Float64Array;
  max: Float64Array;
  multipliers: Complex[];
  stable: boolean;
}

export interface CycleBifurcation {
  /** lpc: fold of limit cycles (multiplier +1); pd: period doubling (-1); ns: Neimark-Sacker (complex pair). */
  kind: 'lpc' | 'pd' | 'ns';
  lambda: number;
  period: number;
}

export interface CycleBranch {
  points: CycleBranchPoint[];
  bifurcations: CycleBifurcation[];
}

function flowOnly(c: CTRNNParams, I: ArrayLike<number>, y0: Float64Array, T: number, h: number): Float64Array {
  const y = y0.slice();
  new Integrator(c, I).run(y, null, T, h);
  return y;
}

function flowWithMonodromy(c: CTRNNParams, I: ArrayLike<number>, y0: Float64Array, T: number, h: number): { y: Float64Array; M: Float64Array } {
  const n = c.size, y = y0.slice(), M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) M[i * n + i] = 1;
  new Integrator(c, I).run(y, M, T, h);
  return { y, M };
}

/** Integration step for continuation: accurate for RK4 relative to the fastest time constant. */
function stepFor(c: CTRNNParams): number {
  return Math.min(0.05, Math.min(...c.taus) / 20);
}

/** The Floquet multipliers without the trivial one (the multiplier closest to 1). */
export function nontrivialMultipliers(ms: Complex[]): Complex[] {
  let k = 0;
  ms.forEach((m, i) => { if (Math.hypot(m.re - 1, m.im) < Math.hypot(ms[k].re - 1, ms[k].im)) k = i; });
  return ms.filter((_, i) => i !== k);
}

function cyclePoint(fam: ParamFamily, x: Float64Array, T: number, lambda: number, h: number): CycleBranchPoint {
  const c = fam.circuit(lambda), I = fam.inputs(lambda), n = c.size;
  const { M } = flowWithMonodromy(c, I, x, T, h);
  const multipliers = eigenvalues(M, n);
  const stable = nontrivialMultipliers(multipliers).every((m) => Math.hypot(m.re, m.im) < 1);
  const min = new Float64Array(n).fill(Infinity), max = new Float64Array(n).fill(-Infinity);
  const samples = 120, q = x.slice(), integ = new Integrator(c, I);
  for (let k = 0; k <= samples; k++) {
    const o = outputsOf(c, q);
    for (let i = 0; i < n; i++) { min[i] = Math.min(min[i], o[i]); max[i] = Math.max(max[i], o[i]); }
    integ.run(q, null, T / samples, h);
  }
  return { lambda, period: T, y: x.slice(), min, max, multipliers, stable };
}

/**
 * Follow a limit cycle (x0 on it, period T0, at lambda0) in both directions until lambda leaves
 * [lmin, lmax], the cycle shrinks onto an equilibrium (a Hopf point), or the period exceeds
 * maxPeriod (approaching a homoclinic orbit).
 */
export function followCycleBranch(fam: ParamFamily, x0: Float64Array, T0: number, lambda0: number, lmin: number, lmax: number,
  opts: { step?: number; maxSteps?: number; h?: number; maxPeriod?: number } = {}): CycleBranch {
  const n = x0.length, h = opts.h ?? stepFor(fam.circuit(lambda0)), maxSteps = opts.maxSteps ?? 300, maxPeriod = opts.maxPeriod ?? 400;
  const h0 = opts.step ?? (lmax - lmin) / 60;
  const N = n + 2;

  const system = (x: Float64Array, T: number, l: number, xr: Float64Array, fr: Float64Array) => {
    const c = fam.circuit(l), I = fam.inputs(l);
    const { y: xT, M } = flowWithMonodromy(c, I, x, T, h);
    const fT = field(c, I, xT);
    const e = 1e-5 * Math.max(1, Math.abs(l));
    const xp = flowOnly(fam.circuit(l + e), fam.inputs(l + e), x, T, h);
    const xm = flowOnly(fam.circuit(l - e), fam.inputs(l - e), x, T, h);
    const G = new Float64Array(n + 1), J = new Float64Array((n + 1) * N);
    for (let i = 0; i < n; i++) {
      G[i] = xT[i] - x[i];
      for (let j = 0; j < n; j++) J[i * N + j] = M[i * n + j] - (i === j ? 1 : 0);
      J[i * N + n] = fT[i];
      J[i * N + n + 1] = (xp[i] - xm[i]) / (2 * e);
    }
    let ph = 0;
    for (let j = 0; j < n; j++) { ph += fr[j] * (x[j] - xr[j]); J[n * N + j] = fr[j]; }
    G[n] = ph;
    return { G, J };
  };
  const tangentOf = (J: Float64Array, prev: Float64Array) => {
    const A = new Float64Array(N * N);
    A.set(J);
    for (let j = 0; j < N; j++) A[(N - 1) * N + j] = prev[j];
    const rhs = new Float64Array(N);
    rhs[N - 1] = 1;
    const t = solveLinear(A, rhs, N);
    if (!t) return null;
    const nn = Math.hypot(...t);
    return t.map((v) => v / nn) as Float64Array;
  };

  const runDir = (dir: number): CycleBranchPoint[] => {
    const pts: CycleBranchPoint[] = [];
    let u: Float64Array = Float64Array.from([...x0, T0, lambda0]);
    let step = h0;
    let xr: Float64Array = x0.slice();
    let fr = field(fam.circuit(lambda0), fam.inputs(lambda0), x0);
    const init = system(x0, T0, lambda0, xr, fr);
    let t = tangentOf(init.J, Float64Array.from({ length: N }, (_, i) => (i === N - 1 ? dir : 0)));
    if (!t) return pts;
    if (t[N - 1] * dir < 0) t = t.map((v) => -v) as Float64Array;
    for (let k = 0; k < maxSteps; k++) {
      let v: Float64Array = Float64Array.from(u, (val, i) => val + step * t![i]);
      let ok = false, lastJ: Float64Array | null = null;
      for (let it = 0; it < 12; it++) {
        const { G, J } = system(v.slice(0, n), v[n], v[n + 1], xr, fr);
        const A = new Float64Array(N * N), r = new Float64Array(N);
        A.set(J);
        r.set(G);
        let arc = 0;
        for (let j = 0; j < N; j++) { A[(N - 1) * N + j] = t![j]; arc += t![j] * (v[j] - u[j]); }
        r[N - 1] = arc - step;
        const d = solveLinear(A, r, N);
        if (!d) break;
        v = Float64Array.from(v, (val, i) => val - d[i]);
        lastJ = J;
        // Reject wild iterates before integrating over them (a huge trial period would take forever)
        if (!(v[n] > 0.05 * T0) || v[n] > 1.5 * maxPeriod || !v.every(Number.isFinite)) break;
        if (Math.hypot(...d) < 1e-9) { ok = true; break; }
      }
      if (!ok || !v.every(Number.isFinite) || !(v[n] > 0) || !lastJ) {
        step /= 2;
        if (step < h0 * 1e-3) break;
        continue;
      }
      const tn = tangentOf(lastJ, t!);
      if (!tn) break;
      const prevU: Float64Array = u, prevT: Float64Array = t!;
      u = v;
      t = tn;
      const x = u.slice(0, n), T = u[n], l = u[n + 1];
      const p = cyclePoint(fam, x, T, l, h);
      // Stop when the cycle has shrunk onto the equilibrium (a Hopf point) or grown too slow
      const amp = Math.max(...Array.from(p.max, (m, i) => m - p.min[i]));
      if (T > maxPeriod) break;
      if (amp < 1e-3) {
        // Jumped onto the collapsed cycle past a Hopf point: retry with a smaller step to approach it
        u = prevU; t = prevT;
        step /= 2;
        if (step < h0 * 0.03) break;
        continue;
      }
      pts.push(p);
      xr = x.slice();
      fr = field(fam.circuit(l), fam.inputs(l), x);
      if (l < lmin || l > lmax) break;
      step = Math.min(step * 1.5, h0 * 4);
    }
    return pts;
  };
  const back = runDir(-1).reverse();
  const fwd = runDir(1);
  const mid = cyclePoint(fam, x0, T0, lambda0, h);
  const points = [...back, mid, ...fwd].filter((p) => p.lambda >= lmin - 1e-9 && p.lambda <= lmax + 1e-9);
  return { points, bifurcations: cycleBifurcations(points) };
}

function cycleBifurcations(pts: CycleBranchPoint[]): CycleBifurcation[] {
  const out: CycleBifurcation[] = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (a.stable === b.stable) continue;
    const crossing = [...nontrivialMultipliers(a.multipliers), ...nontrivialMultipliers(b.multipliers)]
      .reduce((m, z) => (Math.abs(Math.hypot(z.re, z.im) - 1) < Math.abs(Math.hypot(m.re, m.im) - 1) ? z : m));
    const kind = Math.abs(crossing.im) > 1e-3 ? 'ns' : crossing.re > 0 ? 'lpc' : 'pd';
    out.push({ kind, lambda: (a.lambda + b.lambda) / 2, period: (a.period + b.period) / 2 });
  }
  return out;
}

/**
 * All limit-cycle branches found over [lmin, lmax]. Seeds are cycles found by simulation from
 * `start` at several parameter values (stable cycles), and near each Hopf point of the
 * equilibrium branches, in forward and reverse time (so unstable cycles are found too).
 */
export function cycleBranches(fam: ParamFamily, lmin: number, lmax: number, eqBranches: Branch[], start: ArrayLike<number>,
  opts: { samples?: number; h?: number; maxPeriod?: number } = {}): CycleBranch[] {
  const out: CycleBranch[] = [];
  const known = (l: number, T: number) => out.some((b) => b.points.some((p, k) => {
    if (k === 0) return false;
    const q = b.points[k - 1];
    return (l - q.lambda) * (l - p.lambda) <= 0 && Math.abs(T - (q.period + p.period) / 2) < 0.02 * T;
  }));
  const seeds: { l: number; y: ArrayLike<number>; reverse: boolean }[] = [];
  const S = opts.samples ?? 8;
  for (let s = 0; s < S; s++) seeds.push({ l: lmin + ((lmax - lmin) * (s + 0.5)) / S, y: start, reverse: false });
  for (const b of eqBranches)
    for (const bp of b.bifurcations)
      if (bp.kind === 'hopf') {
        const d = 0.02 * (lmax - lmin);
        for (const l of [bp.lambda - d, bp.lambda + d])
          for (const reverse of [false, true]) seeds.push({ l, y: Float64Array.from(bp.y, (v, i) => v + 0.05 * (i + 1)), reverse });
      }
  for (const sd of seeds) {
    const c = fam.circuit(sd.l), I = fam.inputs(sd.l);
    const lc = findLimitCycle(c, I, sd.y, { settle: 100, maxPeriod: opts.maxPeriod ?? 300, h: opts.h ?? stepFor(c), reverse: sd.reverse });
    if (!lc) continue;
    let amp = 0;
    for (const y of lc.trajectory) for (let i = 0; i < c.size; i++) amp = Math.max(amp, Math.abs(y[i] - lc.y[i]));
    if (amp < 1e-3 || known(sd.l, lc.period)) continue;
    out.push(followCycleBranch(fam, lc.y, lc.period, sd.l, lmin, lmax, { h: opts.h, maxPeriod: opts.maxPeriod }));
  }
  return out;
}
