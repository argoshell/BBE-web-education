import { readFileSync } from 'node:fs';
import { CTRNN } from '../../src/sim/core/ctrnn';
import { runFalls } from '../../src/sim/agents/minimal/body';
import { decode } from '../../src/sim/agents/minimal/network';
import { memoryArchs, memoryEvalTrials, memoryEye, slocumRanges } from '../../src/sim/agents/minimal/memory';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const c = decode(r.genome, memoryArchs.diagonal, slocumRanges);
for (const t of memoryEvalTrials('diagonal')) {
  const o = runFalls(CTRNN.fromParams(c), memoryEye, 5, [{ x: t.x, vx: t.vx, vy: -2 }], 0.1, { blindAfter: 0.1 });
  console.log(t.x.toFixed(1).padStart(5), t.vx.toFixed(2).padStart(5), 'miss', Math.abs(o.dx[0]).toFixed(1).padStart(6), 'blindT', o.blindT.toFixed(1));
}
