import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RandomState } from '../src/sim/core/random';
import {
  centerCrossingBiases, decodeOsc, defaultOscRanges, mapCell, oscGenomeSize, oscillatorAgent, simulateOsc,
} from '../src/sim/agents/oscillator';
import { cycleStats } from '../src/sim/analysis/oscillation';

const ref = JSON.parse(readFileSync(new URL('./fixtures/reference.json', import.meta.url), 'utf8'));

describe('oscillator agent', () => {
  it('reproduces SimpleCTRNNMain (C++ fixture) to rounding', () => {
    const s = oscillatorAgent.defaultParams();
    const rec = simulateOsc({ ...s, run: { ...s.run, duration: 25 } });
    const o1 = Array.from(rec.channels.o1).slice(0, 2501), o2 = Array.from(rec.channels.o2).slice(0, 2501);
    // Math.exp may differ from C's exp in the last bit
    for (let i = 0; i < o1.length; i++) {
      expect(Math.abs(o1[i] - ref.ctrnnEuler.o1[i])).toBeLessThan(1e-12);
      expect(Math.abs(o2[i] - ref.ctrnnEuler.o2[i])).toBeLessThan(1e-12);
    }
  });

  it('the default circuit oscillates', () => {
    const s = oscillatorAgent.defaultParams();
    const rec = simulateOsc(s);
    const st = cycleStats(rec.t, rec.channels.o1, 5000);
    expect(st.amplitude).toBeGreaterThan(0.3);
    expect(st.period).toBeGreaterThan(1);
    expect(rec.summary.fitness).toBeGreaterThan(0.03);
  });

  it('center-crossing genomes have center-crossing biases', () => {
    const e = { size: 3, centerCrossing: true, ranges: defaultOscRanges, run: oscillatorAgent.defaultParams().run, fitness: { kind: 'change' as const, targetPeriod: 10 } };
    const rs = new RandomState(3);
    const g = Float64Array.from({ length: oscGenomeSize(e) }, () => rs.uniformRandom(-1, 1));
    const c = decodeOsc(g, e);
    expect(oscGenomeSize(e)).toBe(3 + 9);
    expect(c.biases).toEqual(centerCrossingBiases(c));
    expect(oscillatorAgent.genomeLabels(e).length).toBe(oscGenomeSize(e));
  });

  it('parameter map cells classify oscillation and fixed points', () => {
    const s = oscillatorAgent.defaultParams();
    const osc = mapCell(s, 'bias:0', -2.75, 'bias:1', -1.75, 'amplitude');
    expect(osc.amplitude).toBeGreaterThan(0.3);
    const flat = mapCell(s, 'bias:0', 10, 'bias:1', 10, 'amplitude');
    expect(flat.amplitude).toBeLessThan(0.01);
    expect(mapCell(s, 'bias:0', 10, 'bias:1', 10, 'stable').stable).toBe(1);
  });
});

import oscPresets from '../src/sim/agents/oscillator/evolvedPresets.json';
import { refinedFitness } from '../src/sim/agents/oscillator';

describe('oscillator presets', () => {
  it('reproduce their recorded fitness and are not numerical artifacts', () => {
    for (const p of oscPresets as { name: string; fitness: number }[]) {
      const preset = oscillatorAgent.presets.find((q) => q.name.startsWith(p.name))!;
      const s = preset.params();
      const fit = simulateOsc(s).summary.fitness;
      expect(fit).toBeCloseTo(p.fitness, 10);
      expect(Math.abs(refinedFitness(s) - fit)).toBeLessThan(0.1 * fit);
    }
  });
});
