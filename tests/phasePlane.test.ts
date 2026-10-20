import { describe, expect, it } from 'vitest';
import { sigmoid } from '../src/sim/core/ctrnn';
import { PlaneSlice } from '../src/sim/analysis/phasePlane';

// The bistable/oscillatory 2-neuron circuit from SimpleCTRNNMain.cpp
const circuit = { size: 2, taus: [1, 1], biases: [-2.75, -1.75], gains: [1, 1], weights: [4.5, -1, 1, 4.5] };

describe('PlaneSlice', () => {
  it('finds fixed points that are zeros of the flow', () => {
    for (const space of ['state', 'output'] as const) {
      const s = new PlaneSlice({
        circuit, i: 0, j: 1, space, outputs: [0, 0], inputs: [0, 0],
        xRange: space === 'output' ? [0, 1] : [-10, 10], yRange: space === 'output' ? [0, 1] : [-10, 10],
      });
      const fps = s.fixedPoints();
      expect(fps.length).toBeGreaterThan(0);
      for (const p of fps) {
        const [dx, dy] = s.velocity(p.x, p.y);
        expect(Math.abs(dx) + Math.abs(dy)).toBeLessThan(1e-7);
      }
    }
  });

  it('nullcline points have zero derivative for their neuron', () => {
    const s = new PlaneSlice({ circuit, i: 0, j: 1, space: 'output', outputs: [0, 0], inputs: [0, 0], xRange: [0, 1], yRange: [0, 1] });
    const { xNull, yNull } = s.nullclines(80);
    expect(xNull.length).toBeGreaterThan(10);
    expect(yNull.length).toBeGreaterThan(10);
    for (const [x, y] of xNull.slice(0, 20)) expect(Math.abs(s.stateDerivs(x, y)[0])).toBeLessThan(0.2);
    for (const [x, y] of yNull.slice(0, 20)) expect(Math.abs(s.stateDerivs(x, y)[1])).toBeLessThan(0.2);
  });

  it('includes frozen neurons in the input', () => {
    const c3 = { size: 3, taus: [1, 1, 1], biases: [0, 0, 0], gains: [1, 1, 1], weights: [0, 0, 0, 0, 0, 0, 5, -5, 0] };
    const s = new PlaneSlice({ circuit: c3, i: 0, j: 1, space: 'state', outputs: [0, 0, 1], inputs: [0.5, 0, 0], xRange: [-10, 10], yRange: [-10, 10] });
    const [fp] = s.fixedPoints();
    expect(fp.x).toBeCloseTo(5.5, 8);
    expect(fp.y).toBeCloseTo(-5, 8);
    expect(fp.stable).toBe(true);
    expect(sigmoid(0)).toBe(0.5);
  });
});
