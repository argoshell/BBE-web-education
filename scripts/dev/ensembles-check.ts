import { infoOverTime } from '../../src/sim/analysis/information';
import { orientationAgent } from '../../src/sim/agents/minimal/orientation';
import { memoryAgent } from '../../src/sim/agents/minimal/memory';
import { attentionAgent } from '../../src/sim/agents/minimal/attention';
import { attentionEnsemble, memoryEnsemble, orientationEnsemble } from '../../src/sim/agents/minimal/ensembles';
const show = (name: string, e: ReturnType<typeof orientationEnsemble>) => {
  const t0 = Date.now();
  e.stimuli.forEach((st, k) => {
    const { mi, hS } = infoOverTime(e, k, { bins: 8, binning: 'width', stride: Math.max(1, Math.round(e.t.length / 10)) });
    const best = mi.map((row, c) => [Math.max(...row) / hS, e.channels[c].label] as const).sort((a, b) => b[0] - a[0]).slice(0, 3);
    console.log(name, st.key, best.map(([v, l]) => `${l} ${v.toFixed(2)}`).join(', '));
  });
  console.log(name, 'trials', e.trials, 'samples', e.t.length, `${Date.now() - t0} ms`);
};
let t = Date.now(); const o = orientationEnsemble(orientationAgent.defaultParams(), 200, 0.1); console.log('build', Date.now() - t); show('orient', o);
t = Date.now(); const m = memoryEnsemble(memoryAgent.presets[1].params(), 200); console.log('build', Date.now() - t); show('memory', m);
t = Date.now(); const a = attentionEnsemble(attentionAgent.defaultParams(), 300, 0.1); console.log('build', Date.now() - t); show('attention', a);
