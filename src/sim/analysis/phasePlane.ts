// Two-neuron slices of a CTRNN's flow: vector field, nullclines and fixed points for
// neurons i and j, with all other neurons' outputs and all external inputs held fixed.
//
// Coordinates are either neuron outputs o in (0,1) or states y. The nullcline of
// neuron i is the zero set of dy_i/dt, the same in either coordinate system.

import { inverseSigmoid, sigmoid, type CTRNNParams } from '../core/ctrnn';

export type PlaneSpace = 'output' | 'state';

export interface PlaneSpec {
  circuit: CTRNNParams;
  i: number;
  j: number;
  space: PlaneSpace;
  /** Outputs of every neuron at the frozen instant (entries i and j are ignored). */
  outputs: ArrayLike<number>;
  /** External inputs of every neuron at the frozen instant. */
  inputs: ArrayLike<number>;
  xRange: [number, number];
  yRange: [number, number];
}

export type Segment = [number, number, number, number];

export interface FixedPoint {
  x: number;
  y: number;
  /** Stable node/focus if both eigenvalues have negative real part. */
  stable: boolean;
  kind: 'node' | 'focus' | 'saddle';
}

/** Fixed contribution to each of neurons i, j from everything except o_i and o_j. */
function baseInputs(s: PlaneSpec): [number, number] {
  const { circuit: c, i, j } = s;
  const n = c.size;
  let bi = s.inputs[i], bj = s.inputs[j];
  for (let k = 0; k < n; k++) {
    if (k === i || k === j) continue;
    bi += c.weights[k * n + i] * s.outputs[k];
    bj += c.weights[k * n + j] * s.outputs[k];
  }
  return [bi, bj];
}

export class PlaneSlice {
  private bi: number;
  private bj: number;
  readonly spec: PlaneSpec;
  constructor(spec: PlaneSpec) {
    this.spec = spec;
    [this.bi, this.bj] = baseInputs(spec);
  }

  /** Map a display coordinate to (state, output) for neuron k (= i or j). */
  private toYO(k: number, v: number): [number, number] {
    const c = this.spec.circuit;
    if (this.spec.space === 'output') return [inverseSigmoid(v) / c.gains[k] - c.biases[k], v];
    return [v, sigmoid(c.gains[k] * (v + c.biases[k]))];
  }

  /** dy_i/dt and dy_j/dt at display point (x, y). */
  stateDerivs(x: number, y: number): [number, number] {
    const { circuit: c, i, j } = this.spec;
    const n = c.size;
    const [yi, oi] = this.toYO(i, x);
    const [yj, oj] = this.toYO(j, y);
    const ini = this.bi + c.weights[i * n + i] * oi + c.weights[j * n + i] * oj;
    const inj = this.bj + c.weights[i * n + j] * oi + c.weights[j * n + j] * oj;
    return [(ini - yi) / c.taus[i], (inj - yj) / c.taus[j]];
  }

  /** Velocity in display coordinates. */
  velocity(x: number, y: number): [number, number] {
    const [dyi, dyj] = this.stateDerivs(x, y);
    if (this.spec.space === 'state') return [dyi, dyj];
    const c = this.spec.circuit;
    return [c.gains[this.spec.i] * x * (1 - x) * dyi, c.gains[this.spec.j] * y * (1 - y) * dyj];
  }

  /** Nullcline segments for neuron i (dx=0) and neuron j (dy=0) via marching squares. */
  nullclines(res = 120): { xNull: Segment[]; yNull: Segment[] } {
    const [x0, x1] = this.spec.xRange, [y0, y1] = this.spec.yRange;
    const pad = this.spec.space === 'output' ? 1e-4 : 0;
    const xs = Array.from({ length: res + 1 }, (_, k) => x0 + pad + ((x1 - x0 - 2 * pad) * k) / res);
    const ys = Array.from({ length: res + 1 }, (_, k) => y0 + pad + ((y1 - y0 - 2 * pad) * k) / res);
    const fi = new Float64Array((res + 1) * (res + 1));
    const fj = new Float64Array((res + 1) * (res + 1));
    for (let b = 0; b <= res; b++)
      for (let a = 0; a <= res; a++) {
        const [di, dj] = this.stateDerivs(xs[a], ys[b]);
        fi[b * (res + 1) + a] = di;
        fj[b * (res + 1) + a] = dj;
      }
    return { xNull: contour(fi, xs, ys), yNull: contour(fj, xs, ys) };
  }

  /** Fixed points via Newton's method from a grid of starting points. */
  fixedPoints(grid = 8): FixedPoint[] {
    const { circuit: c, i, j, space } = this.spec;
    const n = c.size;
    // Work in state coordinates, where the system is smooth everywhere.
    const f = (yi: number, yj: number): [number, number] => {
      const oi = sigmoid(c.gains[i] * (yi + c.biases[i]));
      const oj = sigmoid(c.gains[j] * (yj + c.biases[j]));
      return [
        (this.bi + c.weights[i * n + i] * oi + c.weights[j * n + i] * oj - yi) / c.taus[i],
        (this.bj + c.weights[i * n + j] * oi + c.weights[j * n + j] * oj - yj) / c.taus[j],
      ];
    };
    const jac = (yi: number, yj: number) => {
      const oi = sigmoid(c.gains[i] * (yi + c.biases[i]));
      const oj = sigmoid(c.gains[j] * (yj + c.biases[j]));
      const si = c.gains[i] * oi * (1 - oi), sj = c.gains[j] * oj * (1 - oj);
      return [
        (c.weights[i * n + i] * si - 1) / c.taus[i], (c.weights[j * n + i] * sj) / c.taus[i],
        (c.weights[i * n + j] * si) / c.taus[j], (c.weights[j * n + j] * sj - 1) / c.taus[j],
      ];
    };
    // Equilibria satisfy y = total input, so they lie within the reachable input range.
    const span = (k: number, b: number) => {
      let lo = b, hi = b;
      for (const w of [c.weights[i * n + k], c.weights[j * n + k]]) { if (w < 0) lo += w; else hi += w; }
      return [lo - 1, hi + 1];
    };
    const [li, hi] = span(i, this.bi), [lj, hj] = span(j, this.bj);
    const found: FixedPoint[] = [];
    for (let a = 0; a < grid; a++)
      for (let b = 0; b < grid; b++) {
        let yi = li + ((hi - li) * (a + 0.5)) / grid, yj = lj + ((hj - lj) * (b + 0.5)) / grid;
        let ok = false;
        for (let it = 0; it < 50; it++) {
          const [g1, g2] = f(yi, yj);
          const [a11, a12, a21, a22] = jac(yi, yj);
          const det = a11 * a22 - a12 * a21;
          if (Math.abs(det) < 1e-14) break;
          const dyi = (a22 * g1 - a12 * g2) / det, dyj = (a11 * g2 - a21 * g1) / det;
          yi -= dyi; yj -= dyj;
          if (!Number.isFinite(yi) || !Number.isFinite(yj)) break;
          if (Math.abs(dyi) + Math.abs(dyj) < 1e-11) { ok = true; break; }
        }
        if (!ok) continue;
        const [r1, r2] = f(yi, yj);
        if (Math.abs(r1) + Math.abs(r2) > 1e-8) continue;
        if (found.some((p) => Math.abs(p.x - yi) + Math.abs(p.y - yj) < 1e-6)) continue;
        const [a11, a12, a21, a22] = jac(yi, yj);
        const tr = a11 + a22, det = a11 * a22 - a12 * a21, disc = tr * tr - 4 * det;
        const kind = det < 0 ? 'saddle' : disc < 0 ? 'focus' : 'node';
        found.push({ x: yi, y: yj, stable: det > 0 && tr < 0, kind });
      }
    if (space === 'state') return found;
    return found.map((p) => ({
      ...p,
      x: sigmoid(c.gains[i] * (p.x + c.biases[i])),
      y: sigmoid(c.gains[j] * (p.y + c.biases[j])),
    }));
  }
}

/** Marching squares zero contour of a (n+1)x(n+1) grid of values. */
function contour(f: Float64Array, xs: number[], ys: number[]): Segment[] {
  const nx = xs.length, segs: Segment[] = [];
  const lerp = (a: number, b: number, fa: number, fb: number) => a + ((b - a) * fa) / (fa - fb);
  for (let b = 0; b < ys.length - 1; b++)
    for (let a = 0; a < nx - 1; a++) {
      const f00 = f[b * nx + a], f10 = f[b * nx + a + 1], f01 = f[(b + 1) * nx + a], f11 = f[(b + 1) * nx + a + 1];
      const pts: [number, number][] = [];
      // Edges: bottom (00-10), right (10-11), top (01-11), left (00-01)
      if ((f00 < 0) !== (f10 < 0)) pts.push([lerp(xs[a], xs[a + 1], f00, f10), ys[b]]);
      if ((f10 < 0) !== (f11 < 0)) pts.push([xs[a + 1], lerp(ys[b], ys[b + 1], f10, f11)]);
      if ((f01 < 0) !== (f11 < 0)) pts.push([lerp(xs[a], xs[a + 1], f01, f11), ys[b + 1]]);
      if ((f00 < 0) !== (f01 < 0)) pts.push([xs[a], lerp(ys[b], ys[b + 1], f00, f01)]);
      if (pts.length === 2) segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
      else if (pts.length === 4) {
        segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
        segs.push([pts[2][0], pts[2][1], pts[3][0], pts[3][1]]);
      }
    }
  return segs;
}
