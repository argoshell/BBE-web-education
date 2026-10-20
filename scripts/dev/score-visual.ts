// Prints the per-trial scores of the default visual agent (categorize.ns).
import { runAllTrials, visualAgent } from '../../src/sim/agents/visual';

const r = runAllTrials(visualAgent.defaultParams());
console.log('mean score', (r.reduce((a, b) => a + b.score, 0) / r.length).toFixed(4));
for (const t of r) console.log(t.shape.padEnd(6), t.offset.toFixed(0).padStart(4), 'final dx', t.finalDx.toFixed(1).padStart(6), 'score', t.score.toFixed(2));
