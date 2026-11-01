// Check evolved relational categorizers at half the step size and on random size pairs (relcat's validation).
import { readFileSync } from 'node:fs';
import { decodeNet, defaultRelcatParams as p, relcatFitness, runTrial, SensorAgent } from '../../src/sim/agents/relcat/body';
import { RandomState } from '../../src/sim/core/random';
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const net = decodeNet(j.genome, p, j.evo.symmetric);
  const half = relcatFitness({ ...p, stepSize: p.stepSize / 2 }, net);
  // Random pairs in [20, 50]: success = caught when second smaller, avoided when larger
  const rs = new RandomState(7), agent = new SensorAgent(p, net, 200, 285);
  let ok = 0;
  const N = 200;
  for (let k = 0; k < N; k++) {
    const a = rs.uniformRandom(20, 50), b = rs.uniformRandom(20, 50);
    const r = runTrial(p, agent, a, b);
    const caught = Math.abs(r.finalDx) <= p.agentRadius + b / 2;
    if ((a > b) === caught) ok++;
  }
  console.log(f.split(/[\\/]/).pop(), 'sym', j.evo.symmetric, 'fitness', j.fitness.toFixed(4), 'half-step', half.toFixed(4), 'random-pair success', (ok / N).toFixed(3));
}
