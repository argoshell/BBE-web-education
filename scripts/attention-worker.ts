// Worker for scripts/shape-attention.ts: evaluates genomes on the current trial set.

import { parentPort, workerData } from 'node:worker_threads';
import { decode } from '../src/sim/agents/minimal/network';
import { slocumRanges } from '../src/sim/agents/minimal/memory';
import { attentionArch, attentionPerformance, type AttentionTrial } from '../src/sim/agents/minimal/attention';

const arch = attentionArch(workerData.inter as number);
parentPort!.on('message', (m: { id: number; genomes: Float64Array[]; trials: AttentionTrial[] }) => {
  const perfs = m.genomes.map((g) => attentionPerformance({ arch, circuit: decode(g, arch, slocumRanges) }, m.trials, 0.1));
  parentPort!.postMessage({ id: m.id, perfs });
});
