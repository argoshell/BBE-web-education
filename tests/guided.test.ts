// Izquierdo/Beer/Setzler visually guided tasks against the original C++ (tests/fixtures/visual-tasks.json,
// built by native/harness/guided_fixtures.cpp from reference/visually-guided-agent).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decodeGuided, defaultGrid, GENOME_SIZE, guidedAgent, guidedFitness, guidedGenomeLabels, guidedPresetList,
  guidedTaskFitness, runAllGuidedTrials, runGuidedTrial, CIRCUITSIZE, NUMRAYS, type GuidedTask,
} from '../src/sim/agents/visual/guided';

const ref = JSON.parse(readFileSync(new URL('./fixtures/visual-tasks.json', import.meta.url), 'utf8'));

function maxRelErr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]) / Math.max(1, Math.abs(b[i])));
  return m;
}

describe('guided genome', () => {
  it('has the C++ genome size and one label per gene', () => {
    expect(GENOME_SIZE).toBe(ref.vectSize);
    expect(guidedGenomeLabels()).toHaveLength(GENOME_SIZE);
  });

  ref.genomes.forEach((g: { genome: number[]; circuit: { taus: number[]; biases: number[]; gains: number[]; weights: number[] }; sensorWeights: number[] }, k: number) => {
    it(`decodes genome ${k} like GenPhenMapping + SetController`, () => {
      const c = decodeGuided(g.genome);
      expect(c.circuit.taus).toEqual(g.circuit.taus);
      expect(c.circuit.biases).toEqual(g.circuit.biases);
      expect(c.circuit.gains).toEqual(g.circuit.gains);
      expect(c.circuit.weights).toEqual(g.circuit.weights);
      expect(c.sensorWeights).toEqual(g.sensorWeights);
    });
  });
});

describe('guided trials', () => {
  ref.genomes.forEach((g: { genome: number[]; trials: { task: GuidedTask; pos: number; size: number; steps: number; agentX: number[]; objectY: number[]; inputs: number[]; outputs: number[][]; finalDistance: number }[]; fitness: Record<string, number> }, k: number) => {
    const ctl = decodeGuided(g.genome);
    for (const f of g.trials) {
      it(`genome ${k}: ${f.task} pos ${f.pos} size ${f.size}`, () => {
        const ax: number[] = [], oy: number[] = [], inputs: number[] = [];
        const outs: number[][] = Array.from({ length: CIRCUITSIZE }, () => []);
        const d = runGuidedTrial(ctl, f, 0.1, (a, y, t) => {
          if (t === 0) return;
          ax.push(a.cx);
          oy.push(y);
          for (let i = 0; i < NUMRAYS; i++) inputs.push(a.inputs[i]);
          for (let i = 0; i < CIRCUITSIZE; i++) outs[i].push(a.nervousSystem.outputs[i]);
        });
        expect(ax.length).toBe(f.steps);
        expect(oy).toEqual(f.objectY);
        expect(maxRelErr(inputs, f.inputs)).toBeLessThan(1e-12);
        expect(maxRelErr(ax, f.agentX)).toBeLessThan(1e-9);
        for (let i = 0; i < CIRCUITSIZE; i++) expect(maxRelErr(outs[i], f.outputs[i])).toBeLessThan(1e-9);
        expect(d).toBeCloseTo(f.finalDistance, 9);
      });
    }
    it(`genome ${k}: task fitnesses match CircleSizeCategorization, PerceiveAffordance, MultipleTasks`, () => {
      expect(guidedTaskFitness(ctl, 'size', defaultGrid, 0.1, 75)).toBeCloseTo(g.fitness.size, 10);
      expect(guidedTaskFitness(ctl, 'aperture', defaultGrid, 0.1, 75)).toBeCloseTo(g.fitness.aperture, 10);
      expect(guidedFitness(ctl, 'both', defaultGrid, 0.1, 75)).toBeCloseTo(g.fitness.both, 10);
    });
  });
});

describe('guided presets', () => {
  it('evolved presets reproduce their recorded fitness', () => {
    for (const p of guidedPresetList) {
      const ctl = decodeGuided(p.genome);
      expect(guidedFitness(ctl, p.task, defaultGrid, 0.1, 75)).toBeCloseTo(p.fitness, 12);
    }
  });

  it('module evaluate agrees with the overview', () => {
    const s = guidedAgent.defaultParams();
    for (const task of ['size', 'aperture'] as const) {
      const r = runAllGuidedTrials({ ...s, task });
      const mean = r.reduce((t, x) => t + x.score, 0) / r.length;
      expect(mean).toBeCloseTo(guidedTaskFitness(s, task, defaultGrid, 0.1, 75), 12);
    }
  });
});

import { loadedPreset, presetStateFor } from '../src/sim/agents/visual/guided';

describe('guided task presets', () => {
  it('each task has its own specialist preset that solves the reported case (gap 36 at x = 10)', () => {
    const aperture = presetStateFor('aperture')!;
    const pass = guidedAgent.simulate({ ...aperture, trial: { pos: 10, size: 36 } });
    expect(pass.summary.score).toBeGreaterThan(0.95);
    const avoid = guidedAgent.simulate({ ...aperture, trial: { pos: 10, size: 24 } });
    expect(avoid.summary.score).toBeGreaterThan(0.95);
    // The size specialist was not evolved for apertures and avoids the wide gap
    const size = presetStateFor('size')!;
    expect(guidedAgent.simulate({ ...size, task: 'aperture', trial: { pos: 10, size: 36 } }).summary.score).toBeLessThan(0.5);
  });

  it('recognizes an unmodified preset circuit, but not an edited one', () => {
    const size = presetStateFor('size')!;
    expect(loadedPreset(size)?.task).toBe('size');
    const edited = { ...size, circuit: { ...size.circuit, taus: size.circuit.taus.map((t, i) => (i === 0 ? t + 1e-3 : t)) } };
    expect(loadedPreset(edited)).toBeUndefined();
  });
});
