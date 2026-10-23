// Re-evaluate evolved oscillators at a finer step and with RK4 to check they don't rely on Euler error.
import { readFileSync } from 'node:fs';
import { cycleStats } from '../../src/sim/analysis/oscillation';
import { simulateOsc, transientIndex, type OscState } from '../../src/sim/agents/oscillator';

for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const s: OscState = j.params;
  const row = [f.split(/[\\/]/).pop()!.padEnd(16), 'evolved', j.fitness.toFixed(3)];
  for (const [dt, integ] of [[0.05, 'euler'], [0.01, 'euler'], [0.01, 'rk4']] as const) {
    const st = { ...s, run: { ...s.run, dt, integrator: integ } };
    const r = simulateOsc(st);
    const c = cycleStats(r.t, r.channels.o1, transientIndex(st.run));
    row.push(`${integ}@${dt}: fit ${r.summary.fitness.toFixed(3)} P ${c.period.toFixed(2)}`);
  }
  console.log(row.join('  '));
}
