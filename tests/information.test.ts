import { describe, expect, it } from 'vitest';
import { binQuantile, binWidth, entropy, laggedMI, mutualInformation, pid, shuffleBaseline, specificInformation } from '../src/sim/analysis/information';

const s = Int32Array.from({ length: 400 }, (_, i) => i % 2);

describe('information measures', () => {
  it('entropy and MI of identical / independent variables', () => {
    expect(entropy(s, 2)).toBeCloseTo(1, 12);
    expect(mutualInformation(s, 2, s, 2)).toBeCloseTo(1, 12);
    const indep = Int32Array.from({ length: 400 }, (_, i) => Math.floor(i / 2) % 2);
    expect(mutualInformation(s, 2, indep, 2)).toBeCloseTo(0, 12);
  });

  it('specific information averages to mutual information', () => {
    const x = Int32Array.from(s, (v, i) => (v === 0 ? 0 : i % 3 === 0 ? 0 : 1));
    const sp = specificInformation(s, 2, x, 2);
    expect(0.5 * sp[0] + 0.5 * sp[1]).toBeCloseTo(mutualInformation(s, 2, x, 2), 12);
  });

  it('PID: XOR is pure synergy, copies are pure redundancy, independent sources are unique', () => {
    // S = A xor B with A, B independent uniform bits
    const A = Int32Array.from({ length: 400 }, (_, i) => i % 2), B = Int32Array.from({ length: 400 }, (_, i) => Math.floor(i / 2) % 2);
    const X = Int32Array.from(A, (a, i) => a ^ B[i]);
    const px = pid(X, 2, A, 2, B, 2);
    expect(px.synergy).toBeCloseTo(1, 10);
    expect(px.redundancy).toBeCloseTo(0, 10);
    const pc = pid(A, 2, A, 2, A, 2);
    expect(pc.redundancy).toBeCloseTo(1, 10);
    expect(pc.synergy).toBeCloseTo(0, 10);
    // S = (A, B) as 4 values: each source carries 1 unique bit
    const S = Int32Array.from(A, (a, i) => a + 2 * B[i]);
    const pu = pid(S, 4, A, 2, B, 2);
    expect(pu.total).toBeCloseTo(2, 10);
    expect(pu.redundancy + pu.uniqueA + pu.uniqueB + pu.synergy).toBeCloseTo(2, 10);
  });

  it('shuffle baseline is small for a large sample', () => {
    const x = binWidth(Float64Array.from({ length: 400 }, (_, i) => Math.sin(i * 1.7)), 8, -1, 1);
    expect(shuffleBaseline(s, 2, x, 8).p95).toBeLessThan(0.06);
  });

  it('binning', () => {
    expect(Array.from(binWidth([0, 0.49, 0.5, 1, 2, -1], 2, 0, 1))).toEqual([0, 0, 1, 1, 1, 0]);
    expect(Array.from(binQuantile([5, 1, 3, 2, 4, 6], 3))).toEqual([2, 0, 1, 0, 1, 2]);
  });

  it('lagged MI peaks at the true lag', () => {
    const x = Float64Array.from({ length: 2000 }, (_, i) => Math.sin(i * 0.05) + 0.3 * Math.sin(i * 0.31));
    const y = Float64Array.from(x, (_, i) => x[Math.max(0, i - 20)]);
    const lags = [-40, -20, 0, 20, 40];
    const mi = laggedMI(x, y, lags, 8, 50);
    expect(lags[mi.indexOf(Math.max(...mi))]).toBe(20);
  });
});
