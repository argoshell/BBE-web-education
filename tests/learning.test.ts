// Associative learning (Izquierdo, Harvey & Beer 2008). No code was published, so these check the port
// against the evolved circuits in the paper's appendix and against the task as described.

import { describe, expect, it } from 'vitest';
import { RandomState } from '../src/sim/core/random';
import {
  decodeLearning, drawSequence, forgettingCurve, learningAgent, learningFitness, learningGenomeLabels, learningGenomeSize,
  learningMap, runSequence, stages, strobes, tableA1, tableA2,
} from '../src/sim/agents/learning';

describe('learning task', () => {
  it('genome has N² + 4N genes, time constants mapped exponentially into [1, e^5]', () => {
    expect(learningGenomeSize(3)).toBe(21);
    expect(learningGenomeLabels(5)).toHaveLength(45);
    const lo = decodeLearning(new Array(21).fill(-1), 3), hi = decodeLearning(new Array(21).fill(1), 3);
    expect(lo.circuit.taus[0]).toBeCloseTo(1, 12);
    expect(hi.circuit.taus[2]).toBeCloseTo(Math.exp(5), 9);
    expect(lo.tw[0]).toBe(-10);
    expect(hi.circuit.weights[8]).toBe(10);
  });

  it('runs each phase with the C++ loop shape and evaluates for 10 time units', () => {
    const phases: Record<string, number> = {};
    runSequence(tableA1, [{ pair: 1, delay: 20, tests: [{ temp: 2, wait1: 10, wait2: 10 }] }], 0.1, (_ns, _t, info) => { phases[info.phase] = (phases[info.phase] ?? 0) + 1; });
    expect(phases).toEqual({ rest: 101, pair: 200, delay: 200, test: 100, eval: 100, wait: 100, reward: 100 });
  });

  it('draws the other temperature for a different discrete test, and K tests per environment', () => {
    const plan = drawSequence(new RandomState(4), 'discrete', 50, [0, 5]);
    for (const env of plan) for (const t of env.tests) expect([1, 2]).toContain(t.temp);
    const ks = new Set(plan.map((e) => e.tests.length));
    expect(Math.min(...ks)).toBe(0);
    expect(Math.max(...ks)).toBe(5);
  });

  it('the paper\'s 3-node circuit (Table A1) solves the discrete task (paper: 99.99%)', () => {
    // Its few errors come on the first test after a switch from temperature 1 to 2 (see the assumptions about the reward)
    expect(learningFitness(tableA1, 'discrete', stages[2], 200, 0.1, new RandomState(1))).toBeGreaterThan(0.98);
    expect(learningFitness(tableA1, 'discrete', stages[0], 200, 0.1, new RandomState(1))).toBeGreaterThan(0.998);
  });

  it('the paper\'s 5-node circuit (Table A2) learns any temperature on the continuum (Figure 10a)', () => {
    const map = learningMap(tableA2, 11, 0.1);
    for (let a = 0; a < 11; a++)
      for (let b = 0; b < 11; b++) {
        if (a === b) expect(map[a][b]).toBeGreaterThan(0.9);
        else if (Math.abs(a - b) >= 2) expect(map[a][b]).toBeLessThan(0.15);
      }
    // Stage 4 fitness: the paper reports 96.85%; with our assumed reward signal it is a little lower
    expect(learningFitness(tableA2, 'continuum', stages[3], 100, 0.1, new RandomState(2))).toBeGreaterThan(0.88);
  });

  it('memory of the pairing decays slowly over repeated tests (Figure 10d)', () => {
    const c = forgettingCurve(tableA2, 'continuum', 10, 60, 0.1);
    expect(c[0]).toBeGreaterThan(0.9);
    expect(c[9]).toBeLessThan(c[0] + 1e-9);
  });

  it('strobes every phase boundary', () => {
    const s = strobes(tableA1, 'discrete', 5, 0.1);
    const kinds = new Set(s.map((x) => x.kind));
    for (const k of ['pairing', 'delay', 'test', 'reward+']) expect(kinds).toContain(k);
  });

  it('simulates the default sequence', () => {
    const rec = learningAgent.simulate(learningAgent.defaultParams());
    expect(rec.summary.tests).toBeGreaterThan(0);
    expect(rec.summary.accuracy).toBeGreaterThan(0.5);
  });
});
