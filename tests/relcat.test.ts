// The relational categorization port against the original Python (tests/fixtures/relcat.json,
// produced by native/relcat/run.sh).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeNet, defaultRelcatParams, genomeSize, relcatFitness, runTrial, SensorAgent } from '../src/sim/agents/relcat/body';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ref: any = JSON.parse(readFileSync(new URL('./fixtures/relcat.json', import.meta.url), 'utf8'));
const p = defaultRelcatParams;

function maxRel(a: ArrayLike<number>, b: ArrayLike<number>) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]) / Math.max(1, Math.abs(b[i])));
  return m;
}

describe('relational categorization vs. relcat (Python)', () => {
  it('genome sizes match', () => {
    expect(genomeSize(p, false)).toBe(ref.params.num_parameters);
    expect(genomeSize(p, true)).toBe(ref.symmetricNumParameters);
  });

  for (const [k, c] of (ref.cases as { x: number[]; symmetric: boolean }[]).entries()) {
    describe(`case ${k}${c.symmetric ? ' (symmetric genome)' : ''}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cs: any = c;
      const net = decodeNet(cs.x, p, cs.symmetric);

      it('decodes the genome to the same network', () => {
        const nw = cs.network;
        expect(maxRel(net.sensorWeights, nw.sensorWeights.flat())).toBeLessThan(1e-12);
        expect(maxRel(net.weights, nw.weights.flat())).toBeLessThan(1e-12);
        expect(maxRel(net.biases, nw.biases)).toBeLessThan(1e-12);
        expect(maxRel(net.taus, nw.taus)).toBeLessThan(1e-12);
      });

      it('reproduces every step of the traced trials', () => {
        for (const tr of cs.trials) {
          const agent = new SensorAgent(p, net, 200, 285);
          const ax: number[] = [], by: number[] = [], sens: number[] = [], outs: number[] = [], st: number[] = [], ph: number[] = [];
          const r = runTrial(p, agent, tr.first, tr.second, (a, b, phase) => {
            ax.push(a.x); by.push(b.cy); ph.push(phase);
            sens.push(...a.ns.sensors); outs.push(...a.ns.outputs); st.push(...a.ns.states);
          });
          expect(ax.length).toBe(tr.agentX.length);
          expect(ph).toEqual(tr.phase);
          // The harness logs x inside step(), before clip_position() keeps the agent in the world
          const refX = (tr.agentX as number[]).map((v) => Math.min(Math.max(v, p.worldLeft + p.agentRadius), p.worldRight - p.agentRadius));
          expect(maxRel(ax, refX)).toBeLessThan(1e-9);
          expect(maxRel(by, tr.ballY)).toBeLessThan(1e-12);
          expect(maxRel(sens, tr.sensors.flat())).toBeLessThan(1e-9);
          expect(maxRel(outs, tr.outputs.flat())).toBeLessThan(1e-9);
          expect(maxRel(st, tr.states.flat())).toBeLessThan(1e-9);
          expect(r.score).toBeCloseTo(tr.score, 9);
        }
      });

      it('fitness matches', () => {
        expect(relcatFitness(p, net)).toBeCloseTo(cs.fitness, 9);
      });
    });
  }
});

import { relcatAgent, relcatEnsemble } from '../src/sim/agents/relcat';
import { infoOverTime } from '../src/sim/analysis/information';
import presets from '../src/sim/agents/relcat/evolvedPresets.json';

describe('relational categorization presets', () => {
  it('reproduce their recorded fitness', () => {
    for (const pr of presets as { name: string; fitness: number }[]) {
      const preset = relcatAgent.presets.find((q) => q.name.startsWith(pr.name))!;
      const s = preset.params();
      expect(relcatFitness(s.params, s.net)).toBeCloseTo(pr.fitness, 10);
    }
  });

  it('the best agent carries information about the relation by the end of phase 2', () => {
    const s = relcatAgent.presets[0].params();
    const e = relcatEnsemble(s, [20, 30, 40, 50, 60], 60);
    const { mi, hS } = infoOverTime(e, 0, { bins: 4, binning: 'width', stride: 1 });
    const relX = mi[e.channels.length - 1];
    // Almost nothing about the relation is available during phase 1 (the second circle has not appeared)
    expect(Math.max(...relX.slice(0, 60))).toBeLessThan(0.2 * hS);
    // By the end, the agent's position relative to the circle tells catch from avoid
    expect(relX[relX.length - 1]).toBeGreaterThan(0.6 * hS);
  });
});
