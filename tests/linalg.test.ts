import { describe, expect, it } from 'vitest';
import { determinant, eigenvalues, solveLinear } from '../src/sim/analysis/linalg';
import { RandomState } from '../src/sim/core/random';
import { charPoly } from '../src/sim/analysis/equilibria';

function evalPoly(c: number[], re: number, im: number): number {
  // |p(z)| for monic p with coefficients [1, c1, ..., cn]
  let pr = 0, pi = 0;
  for (const k of c) { const r = pr * re - pi * im + k, i = pr * im + pi * re; pr = r; pi = i; }
  return Math.hypot(pr, pi);
}

describe('eigenvalues', () => {
  it('diagonal and rotation matrices', () => {
    expect(eigenvalues([3, 0, 0, -1], 2).map((e) => e.re)).toEqual([-1, 3]);
    const rot = eigenvalues([0, -2, 2, 0], 2);
    expect(rot.map((e) => Math.abs(e.im))).toEqual([2, 2]);
    expect(rot.every((e) => Math.abs(e.re) < 1e-14)).toBe(true);
  });

  it('eigenvalues are roots of the characteristic polynomial (random matrices up to 14x14)', () => {
    const rs = new RandomState(11);
    for (const n of [2, 3, 5, 8, 14]) {
      const A = Float64Array.from({ length: n * n }, () => rs.uniformRandom(-3, 3));
      const ev = eigenvalues(A, n);
      expect(ev.length).toBe(n);
      const trace = Array.from({ length: n }, (_, i) => A[i * n + i]).reduce((a, b) => a + b, 0);
      expect(ev.reduce((s, e) => s + e.re, 0)).toBeCloseTo(trace, 9);
      expect(Math.abs(ev.reduce((s, e) => s + e.im, 0))).toBeLessThan(1e-9);
      if (n <= 8) {
        const p = charPoly(A, n);
        for (const e of ev) expect(evalPoly(p, e.re, e.im) / (1 + Math.hypot(e.re, e.im) ** n)).toBeLessThan(1e-8);
      }
    }
  });

  it('solveLinear and determinant', () => {
    const A = [2, 1, 1, 3, 2, 1, 2, 1, 3];
    const x = solveLinear(A, [4, 6, 6], 3)!;
    expect(Array.from(x).map((v) => Math.round(v * 1e12) / 1e12)).toEqual([1, 1, 1]);
    expect(determinant(A, 3)).toBeCloseTo(2, 12);
  });
});
