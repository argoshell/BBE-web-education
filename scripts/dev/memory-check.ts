import { readFileSync } from 'node:fs';
import { decode } from '../../src/sim/agents/minimal/network';
import { memoryArchs, memoryEvalTrials, memoryPerformance, randomMemoryTrials, slocumRanges, type MemoryTask } from '../../src/sim/agents/minimal/memory';
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, 'utf8')); const task = r.evo.task as MemoryTask;
  const c = { arch: memoryArchs[task], circuit: decode(r.genome, memoryArchs[task], slocumRanges) };
  console.log(f.split('/').pop(), 'eval', memoryPerformance(c, task, memoryEvalTrials(task), 0.1, 0.1).toFixed(4),
    'random200', memoryPerformance(c, task, randomMemoryTrials(task, 200, 2000), 0.1, 0.1).toFixed(4),
    'dt/2', memoryPerformance(c, task, memoryEvalTrials(task), 0.05, 0.1).toFixed(4));
}
