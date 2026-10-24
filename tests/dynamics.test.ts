import { describe, expect, it } from 'vitest';
import { equilibriumBranches, equilibriumPoints, findLimitCycle, followEquilibriumBranch, type ParamFamily } from '../src/sim/analysis/dynamics';
import { simpleOscillator } from '../src/sim/agents/oscillator';
import { cycleStats } from '../src/sim/analysis/oscillation';
import { runOutputs } from '../src/sim/agents/oscillator';

describe('dynamics', () => {
  it('classifies the SimpleCTRNNMain oscillator: unstable spiral surrounded by a stable limit cycle', () => {
    const eps = equilibriumPoints(simpleOscillator, [0, 0]);
    expect(eps.length).toBe(1);
    expect(eps[0].stability).toBe('unstable');
    expect(eps[0].type).toBe('spiral');
    const lc = findLimitCycle(simpleOscillator, [0, 0], [0.1, -0.2])!;
    expect(lc).not.toBeNull();
    expect(lc.stable).toBe(true);
    // The trivial multiplier is ~1; the other is inside the unit circle
    const mags = lc.multipliers.map((m) => Math.hypot(m.re, m.im)).sort((a, b) => b - a);
    expect(mags[0]).toBeCloseTo(1, 4);
    expect(mags[1]).toBeLessThan(1);
    // Period agrees with direct simulation (RK4, fine step)
    const { t, outputs } = runOutputs(simpleOscillator, { duration: 400, dt: 0.005, integrator: 'rk4', transient: 200, initRange: 0.5, seed: 1 });
    const sim = cycleStats(t, outputs[0], Math.round(200 / 0.005)).period;
    expect(lc.period).toBeCloseTo(sim, 2);
  });

  it('a self-exciting neuron has a fold-bounded bistable region in its input', () => {
    // tau dy/dt = -y + 8 sigma(y - 4) + I : folds near I = -1.04 and I = -2.96 ... symmetric about I = 0
    const c = { size: 1, taus: [1], biases: [-4], gains: [1], weights: [8] };
    const fam: ParamFamily = { circuit: () => c, inputs: (l) => [l] };
    const branches = equilibriumBranches(fam, -3, 3);
    const folds = branches.flatMap((b) => b.bifurcations).filter((b) => b.kind === 'fold');
    const lambdas = [...new Set(folds.map((f) => Math.round(f.lambda * 100) / 100))].sort((a, b) => a - b);
    expect(lambdas.length).toBe(2);
    expect(lambdas[0]).toBeCloseTo(-lambdas[1], 1); // symmetric about I = 0
    // The middle branch is unstable
    const mid = branches.flatMap((b) => b.points).filter((p) => Math.abs(p.lambda) < 0.05);
    expect(mid.some((p) => p.stability === 'unstable')).toBe(true);
    expect(mid.filter((p) => p.stability === 'stable').length).toBeGreaterThan(1);
  });

  it('detects the Hopf bifurcation of the oscillator as a bias varies', () => {
    const fam: ParamFamily = {
      circuit: (l) => ({ ...simpleOscillator, biases: [l, simpleOscillator.biases[1]] }),
      inputs: () => [0, 0],
    };
    const eq = equilibriumPoints(fam.circuit(-2.75), [0, 0])[0];
    const b = followEquilibriumBranch(fam, eq.y, -2.75, -8, 4, { step: 0.02 });
    const hopfs = b.bifurcations.filter((x) => x.kind === 'hopf');
    // Two Hopf points bound the oscillatory region around the default bias -2.75
    expect(hopfs.length).toBe(2);
    expect(hopfs[0].lambda).toBeLessThan(-2.75);
    expect(hopfs[1].lambda).toBeGreaterThan(-2.75);
    // Past the Hopf points the equilibrium is stable and the oscillation is gone
    for (const h of hopfs) {
      const below = b.points.filter((p) => p.lambda < h.lambda - 0.05).at(-1), above = b.points.find((p) => p.lambda > h.lambda + 0.05);
      expect(below && above && below.stability !== above.stability).toBe(true);
    }
  });
});
