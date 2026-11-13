import { attentionAgent, randomAttentionTrials, runAttentionTrials } from '../../src/sim/agents/minimal/attention';
const s = attentionAgent.presets[0].params();
const res = runAttentionTrials(s, randomAttentionTrials(300, 2004)).filter((r) => r.category.po && r.category.op && r.score > 0.97);
for (const r of res.slice(0, 6)) console.log(JSON.stringify(Object.fromEntries(Object.entries(r.trial).map(([k, v]) => [k, +(+v).toFixed(2)]))), r.score.toFixed(3));
