// Collect the best evolve.ts results into a presets file for the minimally cognitive tasks:
//   npx tsx scripts/dev/minimal-presets.ts <agent> <out.json> <name>=<run.json> ...
import { readFileSync, writeFileSync } from 'node:fs';
const [agent, out, ...pairs] = process.argv.slice(2);
const presets = pairs.map((p) => {
  const [name, file] = p.split('=');
  const r = JSON.parse(readFileSync(file, 'utf8'));
  if (r.agent !== agent) throw new Error(`${file} is for ${r.agent}`);
  const base = { name, seed: r.seed, fitness: r.fitness, genome: r.genome.map((g: number) => Number(g.toPrecision(12))) };
  if (agent === 'orientation') return { ...base, kind: r.evo.kind };
  if (agent === 'memory') return { ...base, task: r.evo.task };
  return { ...base, inter: r.evo.inter };
});
writeFileSync(out, JSON.stringify(presets) + '\n');
console.log(presets.map((p) => `${p.name}: ${p.fitness.toFixed(4)}`).join('\n'));
