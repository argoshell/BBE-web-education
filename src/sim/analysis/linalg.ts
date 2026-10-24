// Small dense linear algebra for dynamical analysis: eigenvalues of a general real matrix
// (balancing, reduction to Hessenberg form, shifted QR; after EISPACK balanc/elmhes/hqr as in
// Numerical Recipes), plus matrix helpers. Matrices are row-major Float64Arrays.

export interface Complex {
  re: number;
  im: number;
}

/** Balance a matrix in place to improve eigenvalue accuracy (EISPACK balanc). */
function balance(a: Float64Array, n: number): void {
  const RADIX = 2, sqrdx = RADIX * RADIX;
  let last = 0;
  while (last === 0) {
    last = 1;
    for (let i = 0; i < n; i++) {
      let r = 0, c = 0;
      for (let j = 0; j < n; j++)
        if (j !== i) { c += Math.abs(a[j * n + i]); r += Math.abs(a[i * n + j]); }
      if (c !== 0 && r !== 0) {
        let g = r / RADIX, f = 1;
        const s = c + r;
        while (c < g) { f *= RADIX; c *= sqrdx; }
        g = r * RADIX;
        while (c > g) { f /= RADIX; c /= sqrdx; }
        if ((c + r) / f < 0.95 * s) {
          last = 0;
          g = 1 / f;
          for (let j = 0; j < n; j++) a[i * n + j] *= g;
          for (let j = 0; j < n; j++) a[j * n + i] *= f;
        }
      }
    }
  }
}

/** Reduce to upper Hessenberg form by elimination with pivoting (EISPACK elmhes). */
function hessenberg(a: Float64Array, n: number): void {
  for (let m = 1; m < n - 1; m++) {
    let x = 0, i = m;
    for (let j = m; j < n; j++)
      if (Math.abs(a[j * n + m - 1]) > Math.abs(x)) { x = a[j * n + m - 1]; i = j; }
    if (i !== m) {
      for (let j = m - 1; j < n; j++) { const t = a[i * n + j]; a[i * n + j] = a[m * n + j]; a[m * n + j] = t; }
      for (let j = 0; j < n; j++) { const t = a[j * n + i]; a[j * n + i] = a[j * n + m]; a[j * n + m] = t; }
    }
    if (x !== 0) {
      for (i = m + 1; i < n; i++) {
        let y = a[i * n + m - 1];
        if (y !== 0) {
          y /= x;
          a[i * n + m - 1] = y;
          for (let j = m; j < n; j++) a[i * n + j] -= y * a[m * n + j];
          for (let j = 0; j < n; j++) a[j * n + m] += y * a[j * n + i];
        }
      }
    }
  }
  // Zero the multipliers stored below the subdiagonal
  for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) a[i * n + j] = 0;
}

/** Eigenvalues of an upper Hessenberg matrix by the Francis double-shift QR algorithm (EISPACK hqr). */
function hqr(a: Float64Array, n: number): Complex[] {
  const A = (i: number, j: number) => a[i * n + j];
  const set = (i: number, j: number, v: number) => { a[i * n + j] = v; };
  const wr = new Float64Array(n), wi = new Float64Array(n);
  let anorm = 0;
  for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(A(i, j));
  let nn = n - 1, t = 0;
  let p = 0, q = 0, r = 0, s = 0, w = 0, x = 0, y = 0, z = 0;
  while (nn >= 0) {
    let its = 0, l: number;
    do {
      for (l = nn; l >= 1; l--) {
        s = Math.abs(A(l - 1, l - 1)) + Math.abs(A(l, l));
        if (s === 0) s = anorm;
        if (Math.abs(A(l, l - 1)) + s === s) { set(l, l - 1, 0); break; }
      }
      x = A(nn, nn);
      if (l === nn) {
        wr[nn] = x + t; wi[nn--] = 0;
      } else {
        y = A(nn - 1, nn - 1);
        w = A(nn, nn - 1) * A(nn - 1, nn);
        if (l === nn - 1) {
          p = 0.5 * (y - x);
          q = p * p + w;
          z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + (p >= 0 ? Math.abs(z) : -Math.abs(z));
            wr[nn - 1] = wr[nn] = x + z;
            if (z) wr[nn] = x - w / z;
            wi[nn - 1] = wi[nn] = 0;
          } else {
            wr[nn - 1] = wr[nn] = x + p;
            wi[nn - 1] = -(wi[nn] = z);
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('Too many iterations in hqr');
          if (its === 10 || its === 20) {
            // Exceptional shift
            t += x;
            for (let i = 0; i <= nn; i++) set(i, i, A(i, i) - x);
            s = Math.abs(A(nn, nn - 1)) + Math.abs(A(nn - 1, nn - 2));
            y = x = 0.75 * s;
            w = -0.4375 * s * s;
          }
          ++its;
          let m: number;
          for (m = nn - 2; m >= l; m--) {
            z = A(m, m);
            r = x - z;
            s = y - z;
            p = (r * s - w) / A(m + 1, m) + A(m, m + 1);
            q = A(m + 1, m + 1) - z - r - s;
            r = A(m + 2, m + 1);
            s = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= s; q /= s; r /= s;
            if (m === l) break;
            const u = Math.abs(A(m, m - 1)) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(A(m - 1, m - 1)) + Math.abs(z) + Math.abs(A(m + 1, m + 1)));
            if (u + v === v) break;
          }
          for (let i = m; i < nn - 1; i++) {
            set(i + 2, i, 0);
            if (i !== m) set(i + 2, i - 1, 0);
          }
          for (let k = m; k < nn; k++) {
            if (k !== m) {
              p = A(k, k - 1);
              q = A(k + 1, k - 1);
              r = 0;
              if (k + 1 !== nn) r = A(k + 2, k - 1);
              if ((x = Math.abs(p) + Math.abs(q) + Math.abs(r)) !== 0) { p /= x; q /= x; r /= x; }
            }
            const sg = Math.sqrt(p * p + q * q + r * r);
            if ((s = p >= 0 ? sg : -sg) !== 0) {
              if (k === m) {
                if (l !== m) set(k, k - 1, -A(k, k - 1));
              } else set(k, k - 1, -s * x);
              p += s;
              x = p / s; y = q / s; z = r / s; q /= p; r /= p;
              for (let j = k; j <= nn; j++) {
                p = A(k, j) + q * A(k + 1, j);
                if (k + 1 !== nn) { p += r * A(k + 2, j); set(k + 2, j, A(k + 2, j) - p * z); }
                set(k + 1, j, A(k + 1, j) - p * y);
                set(k, j, A(k, j) - p * x);
              }
              const mmin = nn < k + 3 ? nn : k + 3;
              for (let i = l; i <= mmin; i++) {
                p = x * A(i, k) + y * A(i, k + 1);
                if (k + 1 !== nn) { p += z * A(i, k + 2); set(i, k + 2, A(i, k + 2) - p * r); }
                set(i, k + 1, A(i, k + 1) - p * q);
                set(i, k, A(i, k) - p);
              }
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return Array.from({ length: n }, (_, i) => ({ re: wr[i], im: wi[i] }));
}

/** Eigenvalues of a general real n x n matrix (row-major), sorted by real part ascending. */
export function eigenvalues(m: ArrayLike<number>, n: number): Complex[] {
  if (n === 0) return [];
  if (n === 1) return [{ re: m[0], im: 0 }];
  const a = Float64Array.from(m);
  balance(a, n);
  hessenberg(a, n);
  return hqr(a, n).sort((p, q) => p.re - q.re || p.im - q.im);
}

/** Solve A x = b by Gaussian elimination with partial pivoting (copies inputs). Returns null if singular. */
export function solveLinear(Ain: ArrayLike<number>, bin: ArrayLike<number>, n: number): Float64Array | null {
  const A = Float64Array.from(Ain), b = Float64Array.from(bin);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i * n + k]) > Math.abs(A[p * n + k])) p = i;
    if (Math.abs(A[p * n + k]) < 1e-300) return null;
    if (p !== k) {
      for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
      const t = b[k]; b[k] = b[p]; b[p] = t;
    }
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / A[k * n + k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) A[i * n + j] -= f * A[k * n + j];
      b[i] -= f * b[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * b[j];
    b[i] = s / A[i * n + i];
  }
  return b;
}

export function determinant(Ain: ArrayLike<number>, n: number): number {
  const A = Float64Array.from(Ain);
  let det = 1;
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i * n + k]) > Math.abs(A[p * n + k])) p = i;
    if (A[p * n + k] === 0) return 0;
    if (p !== k) {
      for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
      det = -det;
    }
    det *= A[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / A[k * n + k];
      for (let j = k; j < n; j++) A[i * n + j] -= f * A[k * n + j];
    }
  }
  return det;
}
