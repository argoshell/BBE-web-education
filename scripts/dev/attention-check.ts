import { readFileSync } from 'node:fs';
import { decode } from '../../src/sim/agents/minimal/network';
import { slocumRanges } from '../../src/sim/agents/minimal/memory';
import { attentionArch, attentionPerformance, randomAttentionTrials, runAttentionTrials, categoryIndex } from '../../src/sim/agents/minimal/attention';
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(f, 'utf8')); const arch = attentionArch(r.evo.inter);
  const s = { arch, circuit: decode(r.genome, arch, slocumRanges), trial: { x1: 0, vx1: 0, vy1: 3, x2: 0, vx2: 0, vy2: 1 }, dt: 0.1 };
  const res = runAttentionTrials(s, randomAttentionTrials(300, 2004));
  const cat = [0, 1, 2, 3].map((k) => { const rs = res.filter((x) => categoryIndex(x.category) === k); return (rs.reduce((a, x) => a + x.score, 0) / rs.length * 100).toFixed(1); });
  console.log(f.split('/').pop(), 'eval', r.fitness.toFixed(4), 'random300', (res.reduce((a, x) => a + x.score, 0) / res.length).toFixed(4), 'by cat', cat.join(' / '),
    'dt/2', attentionPerformance(s, randomAttentionTrials(35, 1), 0.05).toFixed(4));
}
