// Information-theoretic measures on discretized data, after Williams & Beer:
//  - mutual information I(S; X)
//  - specific information I(S = s; X) (DeWeese & Meister 1999), the information X carries about one value of S
//  - partial information decomposition of I(S; A, B) into redundant, unique and synergistic parts using the
//    I_min redundancy measure (Williams & Beer 2010, "Nonnegative decomposition of multivariate information")
//  - a shuffle baseline for the estimation bias of finite samples
// All quantities are in bits. Variables are integer-coded arrays (values 0..n-1).

import { RandomState } from '../core/random';

export type Binning = 'width' | 'quantile';

/** Discretize values into `bins` equal-width bins over [lo, hi] (values outside are clamped). */
export function binWidth(x: ArrayLike<number>, bins: number, lo: number, hi: number): Int32Array {
  const out = new Int32Array(x.length);
  const w = (hi - lo) / bins;
  for (let i = 0; i < x.length; i++) {
    const k = w > 0 ? Math.floor((x[i] - lo) / w) : 0;
    out[i] = k < 0 ? 0 : k >= bins ? bins - 1 : k;
  }
  return out;
}

/** Discretize values into `bins` (approximately) equally populated bins; ties share a bin. */
export function binQuantile(x: ArrayLike<number>, bins: number): Int32Array {
  const n = x.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[a] - x[b]);
  const out = new Int32Array(n);
  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && x[order[j + 1]] === x[order[k]]) j++;
    const bin = Math.min(bins - 1, Math.floor((k * bins) / n));
    for (let m = k; m <= j; m++) out[order[m]] = bin;
    k = j + 1;
  }
  return out;
}

function log2(x: number): number {
  return Math.log(x) / Math.LN2;
}

export function entropy(x: ArrayLike<number>, nx: number): number {
  const c = new Float64Array(nx);
  for (let i = 0; i < x.length; i++) c[x[i]]++;
  let h = 0;
  for (const v of c) if (v > 0) { const p = v / x.length; h -= p * log2(p); }
  return h;
}

/** Joint counts table [ns x nx]. */
function joint(s: ArrayLike<number>, ns: number, x: ArrayLike<number>, nx: number): Float64Array {
  const c = new Float64Array(ns * nx);
  for (let i = 0; i < s.length; i++) c[s[i] * nx + x[i]]++;
  return c;
}

export function mutualInformation(s: ArrayLike<number>, ns: number, x: ArrayLike<number>, nx: number): number {
  const n = s.length;
  if (n === 0) return 0;
  const c = joint(s, ns, x, nx);
  const ps = new Float64Array(ns), px = new Float64Array(nx);
  for (let a = 0; a < ns; a++) for (let b = 0; b < nx; b++) { ps[a] += c[a * nx + b]; px[b] += c[a * nx + b]; }
  let mi = 0;
  for (let a = 0; a < ns; a++)
    for (let b = 0; b < nx; b++) {
      const v = c[a * nx + b];
      if (v > 0) mi += (v / n) * log2((v * n) / (ps[a] * px[b]));
    }
  return Math.max(0, mi);
}

/**
 * Specific information I(S = s; X) for every s: sum_x p(x|s) log2(p(s|x) / p(s)).
 * Its p(s)-weighted average is I(S; X).
 */
export function specificInformation(s: ArrayLike<number>, ns: number, x: ArrayLike<number>, nx: number): Float64Array {
  const c = joint(s, ns, x, nx);
  const ps = new Float64Array(ns), px = new Float64Array(nx);
  for (let a = 0; a < ns; a++) for (let b = 0; b < nx; b++) { ps[a] += c[a * nx + b]; px[b] += c[a * nx + b]; }
  const out = new Float64Array(ns);
  for (let a = 0; a < ns; a++) {
    if (ps[a] === 0) continue;
    let v = 0;
    for (let b = 0; b < nx; b++) {
      const cab = c[a * nx + b];
      if (cab > 0) v += (cab / ps[a]) * log2(cab / px[b] / (ps[a] / s.length));
    }
    out[a] = v;
  }
  return out;
}

/** Combine two discrete variables into one (for joint information). */
export function pair(a: ArrayLike<number>, na: number, b: ArrayLike<number>): Int32Array {
  const out = new Int32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + na * b[i];
  return out;
}

export interface PID {
  redundancy: number;
  uniqueA: number;
  uniqueB: number;
  synergy: number;
  /** I(S; A, B) = redundancy + uniqueA + uniqueB + synergy. */
  total: number;
}

/** Williams & Beer (2010) partial information decomposition with the I_min redundancy. */
export function pid(s: ArrayLike<number>, ns: number, a: ArrayLike<number>, na: number, b: ArrayLike<number>, nb: number): PID {
  const n = s.length;
  const ps = new Float64Array(ns);
  for (let i = 0; i < n; i++) ps[s[i]]++;
  const ia = specificInformation(s, ns, a, na), ib = specificInformation(s, ns, b, nb);
  let redundancy = 0;
  for (let k = 0; k < ns; k++) redundancy += (ps[k] / n) * Math.min(ia[k], ib[k]);
  const mA = mutualInformation(s, ns, a, na), mB = mutualInformation(s, ns, b, nb);
  const total = mutualInformation(s, ns, pair(a, na, b), na * nb);
  return { redundancy, uniqueA: mA - redundancy, uniqueB: mB - redundancy, synergy: total - mA - mB + redundancy, total };
}

/** Mean and 95th percentile of I(S; X) with S randomly permuted: the level expected by chance alone. */
export function shuffleBaseline(s: ArrayLike<number>, ns: number, x: ArrayLike<number>, nx: number, reps = 50, seed = 1): { mean: number; p95: number } {
  const rs = new RandomState(seed);
  const perm = Int32Array.from(s);
  const vals: number[] = [];
  for (let r = 0; r < reps; r++) {
    for (let i = perm.length - 1; i > 0; i--) {
      const j = Math.floor(rs.ran1() * (i + 1));
      const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    vals.push(mutualInformation(perm, ns, x, nx));
  }
  vals.sort((p, q) => p - q);
  return { mean: vals.reduce((p, q) => p + q, 0) / reps, p95: vals[Math.min(reps - 1, Math.floor(0.95 * reps))] };
}

// ------------------------------------------------------------------ ensembles over time

/**
 * A set of trials recorded on a common time base. `stimuli` are per-trial variables
 * (what the agent could know about); `channels` are per-trial time series (what it does).
 */
export interface Ensemble {
  t: Float64Array;
  trials: number;
  stimuli: { key: string; label: string; values: Int32Array; categories: string[] }[];
  channels: { key: string; label: string; range?: [number, number]; data: Float64Array[] }[];
}

/** Values of channel c at time index k across trials. */
function column(c: Ensemble['channels'][number], k: number): Float64Array {
  return Float64Array.from(c.data, (d) => d[Math.min(k, d.length - 1)]);
}

function discretizeColumn(col: Float64Array, bins: number, binning: Binning, range: [number, number]): Int32Array {
  return binning === 'quantile' ? binQuantile(col, bins) : binWidth(col, bins, range[0], range[1]);
}

function channelRange(c: Ensemble['channels'][number]): [number, number] {
  if (c.range) return c.range;
  let lo = Infinity, hi = -Infinity;
  for (const d of c.data) for (const v of d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return lo < hi ? [lo, hi] : [lo - 0.5, lo + 0.5];
}

export interface InfoOptions {
  bins: number;
  binning: Binning;
  /** Compute every `stride` time steps. */
  stride: number;
}

/** I(S; X_c(t)) for every channel c over time. Returns [channel][time sample] and the sample times. */
export function infoOverTime(e: Ensemble, stimulus: number, o: InfoOptions): { t: Float64Array; mi: Float64Array[]; hS: number } {
  const st = e.stimuli[stimulus], ns = st.categories.length;
  const idx: number[] = [];
  for (let k = 0; k < e.t.length; k += o.stride) idx.push(k);
  const mi = e.channels.map((c) => {
    const r = channelRange(c);
    return Float64Array.from(idx, (k) => mutualInformation(st.values, ns, discretizeColumn(column(c, k), o.bins, o.binning, r), o.bins));
  });
  return { t: Float64Array.from(idx, (k) => e.t[k]), mi, hS: entropy(st.values, ns) };
}

/** Specific information for each stimulus value, the shuffle baseline and the PID of two channels over time. */
export function detailOverTime(e: Ensemble, stimulus: number, a: number, b: number, o: InfoOptions) {
  const st = e.stimuli[stimulus], ns = st.categories.length;
  const ca = e.channels[a], cb = e.channels[b];
  const ra = channelRange(ca), rb = channelRange(cb);
  const idx: number[] = [];
  for (let k = 0; k < e.t.length; k += o.stride) idx.push(k);
  const specific = st.categories.map(() => new Float64Array(idx.length));
  const baseline = new Float64Array(idx.length);
  const parts = { redundancy: new Float64Array(idx.length), uniqueA: new Float64Array(idx.length), uniqueB: new Float64Array(idx.length), synergy: new Float64Array(idx.length) };
  idx.forEach((k, m) => {
    const xa = discretizeColumn(column(ca, k), o.bins, o.binning, ra);
    const xb = discretizeColumn(column(cb, k), o.bins, o.binning, rb);
    const sp = specificInformation(st.values, ns, xa, o.bins);
    sp.forEach((v, j) => { specific[j][m] = v; });
    baseline[m] = shuffleBaseline(st.values, ns, xa, o.bins, 30, 1 + m).p95;
    const p = pid(st.values, ns, xa, o.bins, xb, o.bins);
    parts.redundancy[m] = p.redundancy;
    parts.uniqueA[m] = p.uniqueA;
    parts.uniqueB[m] = p.uniqueB;
    parts.synergy[m] = p.synergy;
  });
  return { t: Float64Array.from(idx, (k) => e.t[k]), specific, baseline, pid: parts };
}

// ------------------------------------------------------------------ within one run

/**
 * Lagged mutual information between two channels of one long run:
 * I(X(t); Y(t + lag)) pooled over t >= from. Positive lag: X leads Y.
 */
export function laggedMI(x: ArrayLike<number>, y: ArrayLike<number>, lags: number[], bins: number, from = 0, binning: Binning = 'quantile'): Float64Array {
  return Float64Array.from(lags, (lag) => {
    const a: number[] = [], b: number[] = [];
    for (let t = from; t < x.length; t++) {
      const u = t + lag;
      if (u < from || u >= y.length) continue;
      a.push(x[t]);
      b.push(y[u]);
    }
    const da = binning === 'quantile' ? binQuantile(a, bins) : binWidth(a, bins, Math.min(...a), Math.max(...a) + 1e-12);
    const db = binning === 'quantile' ? binQuantile(b, bins) : binWidth(b, bins, Math.min(...b), Math.max(...b) + 1e-12);
    return mutualInformation(da, bins, db, bins);
  });
}
