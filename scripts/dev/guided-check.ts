// Which circuit passes gap 36 at x = 10? Compare the presets on the affordances task.
import { guidedAgent, runAllGuidedTrials, meanScore } from '../../src/sim/agents/visual/guided';

const def = guidedAgent.defaultParams();
console.log('default task:', def.task);
for (const p of [{ name: 'default params', params: () => def }, ...guidedAgent.presets]) {
  const s = p.params();
  const aperture = { ...s, task: 'aperture' as const, trial: { pos: 10, size: 36 } };
  const r = guidedAgent.simulate(aperture);
  const r24 = guidedAgent.simulate({ ...aperture, trial: { pos: 10, size: 24 } });
  const fit = meanScore(runAllGuidedTrials(aperture, 1000));
  console.log(`${p.name.padEnd(36)} gap36 final dist ${r.summary.finalDistance.toFixed(2).padStart(7)} (score ${r.summary.score.toFixed(3)})  gap24 ${r24.summary.finalDistance.toFixed(1).padStart(6)}  affordances fitness ${fit.toFixed(3)}`);
}
