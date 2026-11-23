// Every background job runs on default parameters and returns structured-cloneable data (what a worker can post back).

import { describe, expect, it } from 'vitest';
import { jobs, type JobName } from '../src/sim/jobs';
import { agentModules } from '../src/sim/agents/registry';
import { defaultGrid } from '../src/sim/agents/visual/guided';
import { trialSizes } from '../src/sim/agents/relcat/body';

const p = (id: string) => agentModules[id].defaultParams();
const osc = p('oscillator');
const circuit = osc.circuit, n = circuit.size;
const family = { circuit, key: 'bias:0', inputs: new Array(n).fill(0) };

const cases: [JobName, unknown][] = [
  ['dynamics.point', { circuit, inputs: new Array(n).fill(0), state: new Array(n).fill(0) }],
  ['dynamics.branches', { family, range: [-6, 6] }],
  ['dynamics.envelope', { family, range: [-6, 6], state: new Array(n).fill(0), neuron: 0 }],
  ['visual.trials', p('visual')],
  ['visual.ensemble', { state: p('visual'), perShape: 4 }],
  ['guided.trials', p('guided')],
  ['guided.ensemble', { state: p('guided'), grid: { ...defaultGrid, posStep: 8, sizeStep: 8 } }],
  ['guided.pinScores', [p('guided')]],
  ['relcat.trials', p('relcat')],
  ['relcat.ensemble', { state: p('relcat'), sizes: trialSizes(p('relcat').params).slice(0, 3) }],
  ['chemotaxis.trials', p('chemotaxis')],
  ['oscillator.refined', osc],
  ['oscillator.mapRows', { state: osc, x: 'bias:0', y: 'bias:1', xr: [-6, 6], yr: [-6, 6], metric: 'amplitude', res: 4, row0: 0, row1: 2 }],
  ['oscillator.curves', { state: osc, x: 'bias:0', y: 'bias:1', xr: [-6, 6], yr: [-6, 6] }],
  ['orientation.summary', p('orientation')],
  ['memory.summary', p('memory')],
  ['attention.summary', { state: p('attention'), trials: 5, seed: 1 }],
  ['learning.summary', p('learning')],
];

describe('background analysis jobs', () => {
  for (const [name, args] of cases)
    it(`${name} returns cloneable data`, () => {
      const out = (jobs[name] as (a: unknown) => unknown)(args);
      expect(out).not.toBeUndefined();
      expect(() => structuredClone(out)).not.toThrow();
    }, 60000);

  it('covers every job except the slow ensembles and on-request analyses', () => {
    const tested = new Set(cases.map((c) => c[0]));
    const skipped = ['dynamics.cycles', 'chemotaxis.refined', 'chemotaxis.pinFits', 'orientation.ensemble', 'memory.ensemble', 'attention.ensemble'];
    for (const k of Object.keys(jobs)) expect(tested.has(k as JobName) || skipped.includes(k)).toBe(true);
  });
});
