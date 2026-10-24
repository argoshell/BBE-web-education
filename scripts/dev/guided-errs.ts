// Reports the largest deviation of the guided-task port from the C++ fixtures (dev aid).
import { readFileSync } from 'node:fs';
import { decodeGuided, defaultGrid, guidedFitness, guidedTaskFitness, runGuidedTrial, CIRCUITSIZE, type GuidedTask } from '../../src/sim/agents/visual/guided';

const ref = JSON.parse(readFileSync(new URL('../../tests/fixtures/visual-tasks.json', import.meta.url), 'utf8'));
let ex = 0, eo = 0, ef = 0;
for (const g of ref.genomes) {
  const ctl = decodeGuided(g.genome);
  for (const f of g.trials as { task: GuidedTask; pos: number; size: number; agentX: number[]; outputs: number[][] }[]) {
    let s = 0;
    runGuidedTrial(ctl, f, 0.1, (a, _y, t) => {
      if (t === 0) return;
      ex = Math.max(ex, Math.abs(a.cx - f.agentX[s]));
      for (let i = 0; i < CIRCUITSIZE; i++) eo = Math.max(eo, Math.abs(a.nervousSystem.outputs[i] - f.outputs[i][s]));
      s++;
    });
  }
  ef = Math.max(ef, Math.abs(guidedTaskFitness(ctl, 'size', defaultGrid, 0.1, 75) - g.fitness.size),
    Math.abs(guidedTaskFitness(ctl, 'aperture', defaultGrid, 0.1, 75) - g.fitness.aperture),
    Math.abs(guidedFitness(ctl, 'both', defaultGrid, 0.1, 75) - g.fitness.both));
}
console.log({ maxAgentXErr: ex, maxOutputErr: eo, maxFitnessErr: ef });
