// Find random trials where the reactive preset loses the object and the dynamical one catches it.
import { CTRNN } from '../../src/sim/core/ctrnn';
import { runFalls } from '../../src/sim/agents/minimal/body';
import { orientationAgent, orientEye, randomOrientTrials, ORIENT_START_Y } from '../../src/sim/agents/minimal/orientation';
const [dyn, rea] = orientationAgent.presets.map((p) => p.params());
const miss = (s: typeof dyn, t: { x: number; vx: number; vy: number }) => Math.abs(runFalls(CTRNN.fromParams(s.circuit), orientEye, 5, [{ ...t, y: ORIENT_START_Y }], 0.1).dx[0]);
for (const t of randomOrientTrials(400, 7)) {
  const d = miss(dyn, t), r = miss(rea, t);
  if (d < 3 && r > 60) console.log(JSON.stringify({ x: +t.x.toFixed(0), vx: +t.vx.toFixed(1), vy: +t.vy.toFixed(1) }), 'dyn', d.toFixed(1), 'rea', r.toFixed(0));
}
