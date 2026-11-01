import { relcatAgent } from '../../src/sim/agents/relcat';
import { RandomState } from '../../src/sim/core/random';
const e = relcatAgent.defaultEvoConfig(relcatAgent.defaultParams());
const rs = new RandomState(1);
const g = Float64Array.from({ length: relcatAgent.genomeSize(e) }, () => rs.uniformRandom(-1, 1));
const t0 = performance.now();
for (let k = 0; k < 5; k++) relcatAgent.evaluate(g, e, rs);
console.log('ms per evaluation', ((performance.now() - t0) / 5).toFixed(1));
