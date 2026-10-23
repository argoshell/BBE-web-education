// Command-line evolution for any agent, e.g. for generating presets:
//   npx tsx scripts/evolve.ts --agent walker --controller cpg --size 5 --pop 96 --gens 250 --seed 1 [--out file.json]
//   npx tsx scripts/evolve.ts --agent visual --pop 96 --gens 1000 --seed 1 --out visual.json
//   npx tsx scripts/evolve.ts --agent oscillator --size 3 --cc true --fitness period --period 10
// Prints progress to stderr and the best individual's parameters as JSON.

import { writeFileSync } from 'node:fs';
import type { AnyAgentModule } from '../src/sim/agent';
import { agentModules } from '../src/sim/agents/registry';
import type { ControllerKind } from '../src/sim/agents/legged/body';
import { defaultSearchConfig, localEvaluator, TSearch } from '../src/sim/core/tsearch';

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const agent: AnyAgentModule = agentModules[args.agent ?? 'walker'];
if (!agent) throw new Error(`Unknown agent ${args.agent}`);

const base = agent.defaultParams();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let evo: any = agent.defaultEvoConfig(base);
if (agent.id === 'walker') {
  evo = {
    ...evo,
    spec: { ...evo.spec, controller: (args.controller ?? 'cpg') as ControllerKind, size: Number(args.size ?? 5) },
    run: { ...evo.run, duration: Number(args.duration ?? 220), randomize: args.randomize === 'true' },
  };
}
if (agent.id === 'oscillator') {
  evo = {
    ...evo,
    size: Number(args.size ?? 2),
    centerCrossing: args.cc === 'true',
    fitness: { kind: args.fitness ?? 'change', targetPeriod: Number(args.period ?? 10) },
  };
}
const search = {
  ...defaultSearchConfig,
  vectorSize: agent.genomeSize(evo),
  populationSize: Number(args.pop ?? 96),
  maxGenerations: Number(args.gens ?? 250),
  seed: Number(args.seed ?? 1),
  mutationVariance: Number(args.mutvar ?? defaultSearchConfig.mutationVariance),
  reproduction: (args.mode ?? 'ga') as 'ga' | 'hill',
};

const s = new TSearch(search, localEvaluator((g, rs) => agent.evaluate(g, evo, rs)));
const t0 = Date.now();
const every = Math.max(1, Math.round(search.maxGenerations / 20));
await s.run((g) => {
  if (g.gen % every === 0 || g.gen === search.maxGenerations)
    console.error(`gen ${g.gen} best ${g.bestSoFar.toFixed(4)} avg ${g.avg.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
});
const best = agent.decode(s.bestVector, evo);
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s; best ${s.bestPerf.toFixed(4)}`);
const out = { agent: agent.id, seed: search.seed, fitness: s.bestPerf, evo, genome: Array.from(s.bestVector), params: best };
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 1));
else console.log(JSON.stringify(out));
