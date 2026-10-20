import { describe, expect, it } from 'vitest';
import { charPoly, findEquilibria, hurwitzStable, sweepEquilibria } from '../src/sim/analysis/equilibria';
import { PlaneSlice } from '../src/sim/analysis/phasePlane';

const bistable = { size: 2, taus: [1, 1], biases: [-2.75, -1.75], gains: [1, 1], weights: [4.5, -1, 1, 4.5] };

describe('equilibria', () => {
  it('charPoly of a diagonal matrix', () => {
    // (x+1)(x+2)(x-3) = x^3 + 0x^2 - 7x - 6
    const A = Float64Array.from([-1, 0, 0, 0, -2, 0, 0, 0, 3]);
    const p = charPoly(A, 3);
    expect(p.map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([1, 0, -7, -6]);
    expect(hurwitzStable(p)).toBe(false);
    expect(hurwitzStable(charPoly(Float64Array.from([-1, 5, 0, -2]), 2))).toBe(true);
    // Focus with positive real part: x^2 - 0.2x + 1
    expect(hurwitzStable([1, -0.2, 1])).toBe(false);
    // Stable cubic (x+1)^3
    expect(hurwitzStable([1, 3, 3, 1])).toBe(true);
  });

  it('agrees with the 2-neuron phase-plane analysis', () => {
    const full = findEquilibria(bistable, [0, 0]);
    const plane = new PlaneSlice({ circuit: bistable, i: 0, j: 1, space: 'state', outputs: [0, 0], inputs: [0, 0], xRange: [-10, 10], yRange: [-10, 10] }).fixedPoints();
    expect(full.length).toBe(plane.length);
    for (const p of plane) {
      const m = full.find((e) => Math.abs(e.y[0] - p.x) < 1e-6 && Math.abs(e.y[1] - p.y) < 1e-6);
      expect(m).toBeTruthy();
      expect(m!.stable).toBe(p.stable);
    }
  });

  it('finds the hysteresis loop of a self-exciting neuron', () => {
    // tau dy/dt = -y + 8 sigma(y - 4) + I is bistable for I near 0
    const c = { size: 1, taus: [1], biases: [-4], gains: [1], weights: [8] };
    const pts = sweepEquilibria(c, (v) => [v], [-3, 3], 60);
    const at0 = pts.filter((p) => Math.abs(p.param) < 1e-9);
    expect(at0.length).toBe(3);
    expect(at0.filter((p) => p.eq.stable).length).toBe(2);
    expect(pts.filter((p) => Math.abs(p.param + 3) < 1e-9).length).toBe(1);
  });

  it('sweeps an input parameter', () => {
    const pts = sweepEquilibria(bistable, (v) => [v, 0], [-6, 6], 40);
    expect(pts.length).toBeGreaterThanOrEqual(41);
    expect(pts.every((p) => p.eq.outputs.every((o) => o > 0 && o < 1))).toBe(true);
  });
});
