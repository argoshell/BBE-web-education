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

describe('saddle manifolds', () => {
  // Strong self-excitation and mutual inhibition: two stable nodes separated by a saddle
  const bi = { size: 2, taus: [1, 1], biases: [-1.5, -1.5], gains: [1, 1], weights: [6, -3, -3, 6] };
  const slice = new PlaneSlice({ circuit: bi, i: 0, j: 1, space: 'state', outputs: [0, 0], inputs: [0, 0], xRange: [-8, 10], yRange: [-8, 10] });

  it('unstable manifolds of the saddle end at the two stable nodes; stable manifolds return to the saddle', () => {
    const fps = slice.fixedPoints();
    const saddle = fps.find((p) => p.kind === 'saddle')!;
    const nodes = fps.filter((p) => p.stable);
    expect(nodes.length).toBe(2);
    const m = slice.saddleManifolds(saddle);
    expect(m.unstable.length).toBe(2);
    expect(m.stable.length).toBe(2);
    const ends = m.unstable.map((tr) => tr[tr.length - 1]);
    for (const [x, y] of ends) expect(nodes.some((n) => Math.hypot(n.x - x, n.y - y) < 0.05)).toBe(true);
    expect(Math.hypot(ends[0][0] - ends[1][0], ends[0][1] - ends[1][1])).toBeGreaterThan(1);
  });

  it('the stable manifold is a separatrix: starting points on either side go to different nodes', () => {
    const fps = slice.fixedPoints();
    const saddle = fps.find((p) => p.kind === 'saddle')!;
    const [branch] = slice.saddleManifolds(saddle).stable;
    // A point a little way along the separatrix, nudged perpendicular to it
    const [px, py] = branch[Math.min(40, branch.length - 1)], [qx, qy] = branch[Math.min(41, branch.length - 1)];
    const nx = -(qy - py), ny = qx - px, nn = Math.hypot(nx, ny);
    const settle = (x: number, y: number) => {
      for (let k = 0; k < 20000; k++) { const [vx, vy] = slice.velocity(x, y); x += 0.01 * vx; y += 0.01 * vy; }
      return [x, y];
    };
    const a = settle(px + (0.05 * nx) / nn, py + (0.05 * ny) / nn), b = settle(px - (0.05 * nx) / nn, py - (0.05 * ny) / nn);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(1);
  });
});
