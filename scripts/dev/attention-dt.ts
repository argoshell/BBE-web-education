import { readFileSync } from 'node:fs';
import { decode } from '../../src/sim/agents/minimal/network';
import { slocumRanges } from '../../src/sim/agents/minimal/memory';
import { attentionArch, attentionPerformance, randomAttentionTrials } from '../../src/sim/agents/minimal/attention';
const trials = randomAttentionTrials(300, 2004);
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, 'utf8')); const arch = attentionArch(r.evo.inter);
  const c = { arch, circuit: decode(r.genome, arch, slocumRanges) };
  console.log(f.split('/').slice(-2).join('/'), 'dt 0.1', attentionPerformance(c, trials, 0.1).toFixed(4), 'dt 0.05', attentionPerformance(c, trials, 0.05).toFixed(4));
}
