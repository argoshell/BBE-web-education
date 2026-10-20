// Invariants of the lineage records that TSearch adds on top of the original algorithm.

import { describe, expect, it } from 'vitest';
import { localEvaluator, mapSearchParameter, TSearch, type SearchConfig } from '../src/sim/core/tsearch';

const quad = (v: Float64Array) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += (mapSearchParameter(v[i], -10, 10) - i) ** 2;
  return 1000 - s;
};

const base: SearchConfig = {
  vectorSize: 5, populationSize: 30, maxGenerations: 25, seed: 7, selection: 'rank', reproduction: 'ga',
  crossover: 'twopoint', elitistFraction: 0.1, maxExpectedOffspring: 1.1, mutationVariance: 0.1,
  crossoverProbability: 0.5, constrain: true, reEvaluate: false,
};

describe('lineage', () => {
  for (const cfg of [base, { ...base, reproduction: 'hill' as const }, { ...base, crossover: 'uniform' as const, reEvaluate: true }]) {
    it(`is consistent for ${cfg.reproduction}/${cfg.crossover}${cfg.reEvaluate ? '/reeval' : ''}`, async () => {
      const s = new TSearch(cfg, localEvaluator(quad));
      await s.run();
      expect(s.generations.length).toBe(cfg.maxGenerations + 1);
      for (const g of s.generations) {
        for (let k = 0; k < g.ids.length; k++) {
          const rec = s.archive.get(g.ids[k]);
          expect(rec).toBeTruthy();
          expect(rec!.born).toBeLessThanOrEqual(g.gen);
          // The genome recorded for an individual is the one that was evaluated
          if (!cfg.reEvaluate && rec!.born === g.gen) expect(quad(rec!.genome)).toBe(rec!.perf);
        }
      }
      for (const rec of s.archive.values()) {
        expect(rec.parents.length).toBe(rec.born === 0 ? 0 : rec.parents.length);
        for (const p of rec.parents) expect(s.archive.get(p)!.born).toBeLessThan(rec.born);
      }
      // The best individual's ancestry reaches generation 0 and ends at the best vector
      const chain = s.ancestry(s.bestId);
      expect(chain[0].born).toBe(0);
      expect(Array.from(chain[chain.length - 1].genome)).toEqual(Array.from(s.bestVector));
      if (cfg.crossoverProbability > 0 && cfg.reproduction === 'ga')
        expect([...s.archive.values()].some((r) => r.parents.length === 2)).toBe(true);
    });
  }
});
