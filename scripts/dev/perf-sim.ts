// Time each agent's single-trial simulation (the part that stays on the main thread).
import { agentModules } from '../../src/sim/agents/registry';
for (const [id, a] of Object.entries(agentModules)) {
  const s = a.defaultParams();
  a.simulate(s);
  const t0 = performance.now(); const n = 5;
  let len = 0;
  for (let k = 0; k < n; k++) len = a.simulate(s).t.length;
  console.log(id.padEnd(12), ((performance.now() - t0) / n).toFixed(1).padStart(7), 'ms', len, 'samples');
}
