// Robustness of evolved guided-task agents (dev aid): fitness at the evolution step (dt 0.1), at
// smaller steps, and on a finer trial grid (generalization, as in GeneralizationCC/PA).
//   npx tsx scripts/dev/guided-robust.ts run1.json run2.json ...
import { readFileSync } from 'node:fs';
import { decodeGuided, defaultGrid, guidedTaskFitness, type GuidedEvoTask, type GuidedTask } from '../../src/sim/agents/visual/guided';

const fine = { ...defaultGrid, posMin: 0, posMax: 25, posStep: 0.5, sizeMin: 20, sizeMax: 40, sizeStep: 0.5, reps: 1 };
for (const f of process.argv.slice(2)) {
  const run = JSON.parse(readFileSync(f, 'utf8')) as { fitness: number; genome: number[]; evo: { task: GuidedEvoTask } };
  const ctl = decodeGuided(run.genome);
  const row: Record<string, string> = { file: f.split(/[\\/]/).pop()!, fit: run.fitness.toFixed(4) };
  for (const task of ['size', 'aperture'] as GuidedTask[]) {
    if (run.evo.task !== 'both' && run.evo.task !== task) continue;
    for (const dt of [0.1, 0.05, 0.02]) row[`${task}@${dt}`] = guidedTaskFitness(ctl, task, defaultGrid, dt, 75).toFixed(4);
    row[`${task}fine`] = guidedTaskFitness(ctl, task, fine, 0.1, 75).toFixed(4);
  }
  console.log(JSON.stringify(row));
}
