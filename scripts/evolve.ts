// Command-line walker evolution, e.g. for generating presets:
//   npx tsx scripts/evolve.ts --controller cpg --size 5 --pop 96 --gens 250 --seed 1 [--out file.json]
// Prints progress and the best walker's parameters as JSON.

import { writeFileSync } from 'node:fs';
import { leggedAgent } from '../src/sim/agents/legged';
import { defaultBody, type ControllerKind } from '../src/sim/agents/legged/body';
import { defaultRanges, defaultRun } from '../src/sim/agents/legged/walker';
import { defaultSearchConfig, localEvaluator, TSearch } from '../src/sim/core/tsearch';

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const controller = (args.controller ?? 'cpg') as ControllerKind;
const size = Number(args.size ?? 5);
const evo = {
  spec: { controller, size, ranges: defaultRanges },
  run: { ...defaultRun, duration: Number(args.duration ?? 220), randomize: args.randomize === 'true' },
  body: { ...defaultBody },
};
const search = {
  ...defaultSearchConfig,
  vectorSize: leggedAgent.genomeSize(evo),
  populationSize: Number(args.pop ?? 96),
  maxGenerations: Number(args.gens ?? 250),
  seed: Number(args.seed ?? 1),
  mutationVariance: Number(args.mutvar ?? defaultSearchConfig.mutationVariance),
  reproduction: (args.mode ?? 'ga') as 'ga' | 'hill',
};

const s = new TSearch(search, localEvaluator((g, rs) => leggedAgent.evaluate(g, evo, rs)));
const t0 = Date.now();
await s.run((g) => {
  if (g.gen % 25 === 0 || g.gen === search.maxGenerations)
    console.error(`gen ${g.gen} best ${g.bestSoFar.toFixed(4)} avg ${g.avg.toFixed(4)}`);
});
const best = leggedAgent.decode(s.bestVector, evo);
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s; best ${s.bestPerf.toFixed(4)}`);
const out = { controller, size, seed: search.seed, fitness: s.bestPerf, circuit: best.circuit, sensorWeights: best.sensorWeights };
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 2));
else console.log(JSON.stringify(out));
