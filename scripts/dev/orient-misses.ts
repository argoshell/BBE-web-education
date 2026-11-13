import { CTRNN } from '../../src/sim/core/ctrnn';
import { runFalls } from '../../src/sim/agents/minimal/body';
import { orientationAgent, orientEye, randomOrientTrials, ORIENT_START_Y } from '../../src/sim/agents/minimal/orientation';
const s = orientationAgent.presets[0].params();
const rows = randomOrientTrials(100, 1996).map((t) => {
  const o = runFalls(CTRNN.fromParams(s.circuit), orientEye, 5, [{ ...t, y: ORIENT_START_Y }], 0.1);
  return { ...t, miss: Math.abs(o.dx[0]) };
}).sort((a, b) => b.miss - a.miss);
for (const r of rows.slice(0, 15)) console.log(r.x.toFixed(0), r.vx.toFixed(1), r.vy.toFixed(1), 'miss', r.miss.toFixed(0));
console.log('median', rows[50].miss.toFixed(1));
