import { describe, expect, it } from 'vitest';
import { leggedAgent } from '../src/sim/agents/legged';
import evolvedPresets from '../src/sim/agents/legged/evolvedPresets.json';
import { decodeGenome, defaultRanges, encodeGenome, genomeSize } from '../src/sim/agents/legged/walker';
import { RandomState } from '../src/sim/core/random';

describe('walker module', () => {
  it('evolved presets reproduce their recorded fitness', () => {
    for (const p of evolvedPresets) {
      const preset = leggedAgent.presets.find((q) => q.name.startsWith(p.name))!;
      const rec = leggedAgent.simulate(preset.params());
      expect(rec.summary.avgVelocity).toBeCloseTo(p.fitness, 12);
    }
  });

  it('decode(encode(p)) is the identity for every controller', () => {
    for (const controller of ['cpg', 'sensor', 'two', 'one'] as const) {
      const spec = { controller, size: 3, ranges: { ...defaultRanges, gain: [0.5, 2] as [number, number] } };
      const rs = new RandomState(5);
      const g = Float64Array.from({ length: genomeSize(spec) }, () => rs.uniformRandom(-1, 1));
      const back = encodeGenome(decodeGenome(g, spec), spec);
      for (let k = 0; k < g.length; k++) expect(back[k]).toBeCloseTo(g[k], 12);
    }
  });

  it('simulate records the initial state plus one sample per step', () => {
    const s = leggedAgent.defaultParams();
    const rec = leggedAgent.simulate(s);
    expect(rec.t.length).toBe(2002);
    expect(rec.channels.o1.length).toBe(2002);
    expect(rec.summary.avgVelocity).toBeCloseTo(0.6148865077875117, 15);
  });

  it('genome labels match genome size', () => {
    const e = leggedAgent.defaultEvoConfig({ ...leggedAgent.defaultParams(), controller: 'sensor' });
    expect(leggedAgent.genomeLabels(e).length).toBe(leggedAgent.genomeSize(e));
  });
});
