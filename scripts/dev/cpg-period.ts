import { findLimitCycle } from '../../src/sim/analysis/dynamics';
import { beerCpg } from '../../src/sim/agents/legged';
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('tests/fixtures/dynamica.json', 'utf8'));
const lc = findLimitCycle(beerCpg, [0, 0, 0, 0, 0], j.cpg.cycleStart, { settle: 50, maxPeriod: 200 });
console.log('site cpg cycle:', lc && { period: lc.period, stable: lc.stable, mults: lc.multipliers.map((m) => Math.hypot(m.re, m.im).toFixed(4)) });
