// Prints the actual differences between the site's dynamics analyses and Dynamica's reference results.
import { readFileSync } from 'node:fs';
import { equilibriumBranches, findLimitCycle, type ParamFamily } from '../../src/sim/analysis/dynamics';
const ref = JSON.parse(readFileSync('tests/fixtures/dynamica.json', 'utf8'));
const c = (x: { taus: number[]; biases: number[]; gains: number[]; weights: number[] }) => ({ size: x.taus.length, ...x });
const osc = c(ref.oscillator.circuit);
const famO: ParamFamily = { circuit: (l) => ({ ...osc, biases: [l, osc.biases[1]] }), inputs: () => [0, 0] };
const hopf = equilibriumBranches(famO, -8, 4).flatMap((b) => b.bifurcations).filter((b) => b.kind === 'hopf');
for (const t of ref.oscillatorBranches.bifurcations) console.log('Hopf', t.parameters[0], 'site', Math.min(...hopf.map((h) => Math.abs(h.lambda - t.parameters[0]))).toExponential(2), 'diff');
const self = { size: 1, taus: [1], biases: [-4], gains: [1], weights: [8] };
const folds = equilibriumBranches({ circuit: () => self, inputs: (l) => [l] }, -3, 3).flatMap((b) => b.bifurcations);
for (const t of ref.selfExcitingBranches.bifurcations) console.log('Fold', t.parameters[0], 'diff', Math.min(...folds.map((h) => Math.abs(h.lambda - t.parameters[0]))).toExponential(2));
for (const k of ['oscillator', 'cpg']) {
  const lc = findLimitCycle(c(ref[k].circuit), new Array(ref[k].circuit.taus.length).fill(0), ref[k].cycleStart, { settle: 20, maxPeriod: 200, h: 0.005 })!;
  console.log(k, 'period Dynamica', ref[k].limitCycle.period, 'site', lc.period, 'diff', Math.abs(lc.period - ref[k].limitCycle.period).toExponential(2));
}
