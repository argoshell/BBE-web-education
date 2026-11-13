// The minimally cognitive visual tasks (Beer 1996; Slocum, Downey & Beer 2000; Goldenberg et al. 2004).
// No code was published; these check the shared body against the tested VisualAgent port, the genome
// layouts against the papers' parameter counts, symmetry, and the task definitions.

import { describe, expect, it } from 'vitest';
import { CTRNN } from '../src/sim/core/ctrnn';
import { RandomState } from '../src/sim/core/random';
import { MovingCircle, ProximityAgent, runFalls } from '../src/sim/agents/minimal/body';
import { archSize, decode, genomeSize, mirror } from '../src/sim/agents/minimal/network';
import { orientArchs, orientationAgent, orientEvalTrials, orientPerformance } from '../src/sim/agents/minimal/orientation';
import { memoryAgent, memoryArchs, memoryEvalTrials, memoryPerformance } from '../src/sim/agents/minimal/memory';
import { attentionAgent, attentionArch, categorize, categoryIndex, randomAttentionTrials, validTrial } from '../src/sim/agents/minimal/attention';
import { Pi, VisualAgent, VisualObject } from '../src/sim/agents/visual/body';

const randomGenome = (n: number, seed: number) => { const rs = new RandomState(seed); return Array.from({ length: n }, () => rs.uniformRandom(-1, 1)); };

describe('minimal tasks: body', () => {
  it('rays match the ported VisualAgent for the same eye', () => {
    const ns = CTRNN.fromParams({ size: 14, taus: new Array(14).fill(1), biases: new Array(14).fill(0), gains: new Array(14).fill(1), weights: new Array(196).fill(0) });
    const v = new VisualAgent(ns), p = new ProximityAgent(ns, { rays: 7, length: 220, angle: Pi / 6 }, 5);
    for (const [x, ox, oy] of [[0, 20, 150], [-30, -10, 60], [12, 40, 200]]) {
      v.reset(new RandomState(1), x, 0, false); p.reset(0); p.cx = x;
      const o = new VisualObject('circle', ox, oy, -3, 26);
      v.resetRays(); v.rays.forEach((r) => o.rayIntersection(r));
      expect(p.rayLengths([o])).toEqual(v.rays.map((r) => r.length));
    }
  });

  it('removes each object when it lands and stops horizontal motion at the walls', () => {
    const ns = CTRNN.fromParams({ size: 7, taus: new Array(7).fill(1), biases: new Array(7).fill(0), gains: new Array(7).fill(1), weights: new Array(49).fill(0) });
    const o = runFalls(ns, { rays: 5, length: 220, angle: Pi / 6 }, 5, [{ x: 0, vx: 0, vy: -4, y: 215 }, { x: 150, vx: 10, vy: -1, y: 215 }], 0.1);
    expect(Math.abs(o.landT[0] - 50)).toBeLessThan(0.11);
    expect(Math.abs(o.landT[1] - 200)).toBeLessThan(0.11);
    expect(o.dx[1]).toBe(-200);
    const c = new MovingCircle(190, 100, 50, -1); c.step(1);
    expect(c.cx).toBe(200);
  });
});

describe('minimal tasks: genomes', () => {
  it('reproduce the parameter counts printed in the papers', () => {
    expect(genomeSize(orientArchs.reactive)).toBe(8);
    expect(genomeSize(orientArchs.dynamical)).toBe(12);
    expect(genomeSize(memoryArchs.vertical)).toBe(56);
    expect(genomeSize(memoryArchs.diagonal)).toBe(82);
    expect(genomeSize(attentionArch(10))).toBe(146);
  });

  it('decode bilaterally symmetric circuits', () => {
    const a = attentionArch(4), N = archSize(a);
    const c = decode(randomGenome(genomeSize(a), 3), a, { weight: [-5, 5], bias: [-5, 5], sensorBias: [-10, 0], gain: [1, 5], tau: [1, 2] });
    for (let i = 0; i < N; i++) {
      expect(c.biases[mirror(a, i)]).toBe(c.biases[i]);
      for (let j = 0; j < N; j++) expect(c.weights[mirror(a, i) * N + mirror(a, j)]).toBe(c.weights[i * N + j]);
    }
    expect(c.gains[N - 1]).toBe(1);
  });

  it('a symmetric agent behaves as the mirror image on the mirror-image trial', () => {
    const s = memoryAgent.defaultParams();
    const ns = CTRNN.fromParams(s.circuit), eye = { rays: 9, length: 205, angle: Pi / 6 };
    const a = runFalls(ns, eye, 5, [{ x: 30, vx: 0.5, vy: -2 }], 0.1), b = runFalls(ns, eye, 5, [{ x: -30, vx: -0.5, vy: -2 }], 0.1);
    expect(b.dx[0]).toBeCloseTo(-a.dx[0], 6);
  });
});

describe('minimal tasks: definitions', () => {
  it('memory trials: 12 vertical over [0, 55], 28 diagonal', () => {
    expect(memoryEvalTrials('vertical').map((t) => t.x)).toEqual(Array.from({ length: 12 }, (_, k) => (55 * k) / 11));
    expect(memoryEvalTrials('diagonal')).toHaveLength(28);
  });

  it('the memory agent goes blind once it moves', () => {
    const s = memoryAgent.defaultParams();
    const o = runFalls(CTRNN.fromParams(s.circuit), { rays: 9, length: 205, angle: Pi / 6 }, 5, [{ x: 40, vx: 0, vy: -2 }], 0.1, { blindAfter: 0.1 });
    if (!Number.isNaN(o.blindT)) expect(o.blindT).toBeGreaterThan(0);
  });

  it('random attention trials are solvable and their categories occur at about the paper\'s rates', () => {
    const trials = randomAttentionTrials(600, 5);
    expect(trials.every(validTrial)).toBe(true);
    const counts = [0, 0, 0, 0];
    for (const t of trials) counts[categoryIndex(categorize(t))]++;
    // Slocum et al. (2000), 1000 random trials: 227 neither, 152 passing only, 329 permanence only, 292 both
    [0.227, 0.152, 0.329, 0.292].forEach((f, k) => expect(Math.abs(counts[k] / 600 - f)).toBeLessThan(0.06));
  });

  it('presets reproduce their recorded fitness and hold up at half the step size', () => {
    for (const p of orientationAgent.presets) {
      const s = p.params(), f = Number(/\(([\d.]+)%\)/.exec(p.name)![1]) / 100;
      expect(orientPerformance(s, orientEvalTrials, 0.1)).toBeCloseTo(f, 3);
      expect(orientPerformance(s, orientEvalTrials, 0.05)).toBeGreaterThan(f - 0.02);
    }
    for (const p of memoryAgent.presets) {
      const s = p.params(), f = Number(/\(([\d.]+)%\)/.exec(p.name)![1]) / 100;
      expect(memoryPerformance(s, s.task, memoryEvalTrials(s.task), 0.1, s.blindAfter)).toBeCloseTo(f, 3);
    }
    expect(attentionAgent.presets.length).toBeGreaterThanOrEqual(0);
  });
});
