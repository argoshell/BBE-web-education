// Category frequencies of random selective-attention trials (compare Slocum et al. 2000: 227/152/329/292 per 1000).
import { categorize, categoryIndex, categoryNames, randomAttentionTrials } from '../../src/sim/agents/minimal/attention';
const t0 = Date.now();
const trials = randomAttentionTrials(1000, 11);
const counts = [0, 0, 0, 0];
for (const t of trials) counts[categoryIndex(categorize(t))]++;
console.log(categoryNames.map((n, k) => `${n}: ${counts[k]}`).join(', '), `(${Date.now() - t0} ms)`);
