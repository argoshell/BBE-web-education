// Performance on 1000 fresh random trials (as Slocum et al. report), per-trial mean score
import { readFileSync } from 'node:fs';
import { decode } from '../../src/sim/agents/minimal/network';
import { slocumRanges } from '../../src/sim/agents/minimal/memory';
import { attentionArch, randomAttentionTrials, runAttentionTrials, categoryIndex } from '../../src/sim/agents/minimal/attention';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8')); const arch = attentionArch(r.evo.inter);
const s = { arch, circuit: decode(r.genome, arch, slocumRanges), trial: { x1: 0, vx1: 0, vy1: 3, x2: 0, vx2: 0, vy2: 1 }, dt: 0.1 };
const res = runAttentionTrials(s, randomAttentionTrials(1000, 777));
const cat = [0, 1, 2, 3].map((k) => { const rs = res.filter((x) => categoryIndex(x.category) === k); return `${rs.length}: ${(rs.reduce((a, x) => a + x.score, 0) / rs.length * 100).toFixed(1)}%`; });
console.log('1000 random:', (res.reduce((a, x) => a + x.score, 0) / res.length * 100).toFixed(1) + '%', cat.join(' | '));
