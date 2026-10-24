// The klinotaxis port against Izquierdo's CE_orientation C++ (tests/fixtures/chemotaxis.json).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RandomState } from '../src/sim/core/random';
import { runProtocol, WormAgent, type WormMode } from '../src/sim/agents/chemotaxis/body';
import {
  chemoGenomeLabels, chemoGenomeSize, chemotaxisAgent, CircuitSize, decodeWorm, defaultRun, defaultTrials,
  evaluateWorm, genPhenMapping, refinedFitness, runAllTrials, trialSetFitness, wormFromPhenotype,
} from '../src/sim/agents/chemotaxis';
import evolved from '../src/sim/agents/chemotaxis/evolvedPresets.json';

const ref = JSON.parse(readFileSync(new URL('./fixtures/chemotaxis.json', import.meta.url), 'utf8'));

/** Max of |a - b| / max(1, |b|) (relative error, absolute near zero). */
function maxRelErr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]) / Math.max(1, Math.abs(b[i])));
  return m;
}

const run = { transient: 250, evalDuration: 100, dt: 0.01 };

describe('chemotaxis genome', () => {
  it('has main.cpp\'s size and labels', () => {
    expect(chemoGenomeSize(CircuitSize)).toBe(ref.constants.VectSize);
    expect(chemoGenomeLabels(CircuitSize).length).toBe(ref.constants.VectSize);
  });

  for (const [k, g] of (ref.genomes as { seed: number; genome: number[]; phenotype: number[]; worm: Record<string, number | number[]> }[]).entries()) {
    it(`GenPhenMapping and SetParameters match (genome ${k})`, () => {
      expect(genPhenMapping(g.genome, CircuitSize)).toEqual(g.phenotype);
      const w = wormFromPhenotype(g.phenotype, CircuitSize);
      expect(w.circuit.taus).toEqual(g.worm.taus);
      expect(w.circuit.biases).toEqual(g.worm.biases);
      expect(w.circuit.gains).toEqual(g.worm.gains);
      expect(w.circuit.weights).toEqual(g.worm.weights);
      expect(w.wASER).toEqual(g.worm.wASER);
      expect(w.wASEL).toEqual(g.worm.wASEL);
      expect([w.wCpgV, w.wCpgD, w.sensorN, w.sensorM, w.outputGain]).toEqual([g.worm.wCpgV, g.worm.wCpgD, g.worm.sensorN, g.worm.sensorM, g.worm.outputGain]);
    });
  }
});

describe('WormAgent trajectories', () => {
  const names = Object.keys(ref).filter((k) => /^(taxis|kinesis|evolved)\d+$/.test(k));
  for (const name of names) {
    it(`matches ${name}`, () => {
      const f = ref[name];
      const genome = name.startsWith('evolved') ? ref.genomes[3 + Number(name.slice(7))].genome
        : ref.genomes[{ taxis0: 0, taxis1: 1, taxis2: 2, kinesis0: 0, kinesis1: 1 }[name as 'taxis0']!].genome;
      const w = new WormAgent(decodeWorm(genome, CircuitSize));
      const steps = new Set<number>(f.step);
      const got: Record<string, number[]> = { px: [], py: [], orient: [], chemCon: [], dist: [], on: [], off: [], theta: [], avgvel: [], avgtheta: [], forward: [], t: [] };
      const outs: number[][] = Array.from({ length: CircuitSize }, () => []), states: number[][] = Array.from({ length: CircuitSize }, () => []);
      const sample = (a: WormAgent, t: number) => {
        got.px.push(a.px); got.py.push(a.py); got.orient.push(a.orient); got.chemCon.push(a.chemCon); got.dist.push(a.distanceToCentre);
        got.on.push(a.oASEL); got.off.push(a.oASER); got.theta.push(a.theta); got.avgvel.push(a.avgvel); got.avgtheta.push(a.avgtheta);
        got.forward.push(a.forward); got.t.push(t);
        for (let i = 0; i < CircuitSize; i++) { outs[i].push(a.ns.outputs[i]); states[i].push(a.ns.states[i]); }
      };
      const mode: WormMode = f.taxis ? 'taxis' : 'kinesis';
      let total = 0;
      const scores = runProtocol(w, { orient: f.initialOrient, gradSteep: f.gradSteep, mode, repeats: f.repeats, transient: 250, evalDuration: 100, dt: 0.01 },
        new RandomState(f.seed), (a, info) => { total = info.step; if (steps.has(info.step)) sample(a, info.t); }, (a) => sample(a, 0));
      expect(total).toBe(f.totalSteps);
      expect(w.timer).toBe(f.finalTimer);
      expect(got.t).toEqual(f.t);
      const errs: Record<string, number> = {};
      for (const k of Object.keys(got)) errs[k] = maxRelErr(got[k], f[k]);
      errs.outputs = Math.max(...outs.map((o, i) => maxRelErr(o, f.outputs[i])));
      errs.states = Math.max(...states.map((s, i) => maxRelErr(s, f.states[i])));
      for (const [k, e] of Object.entries(errs)) expect(e, k).toBeLessThan(1e-9);
      expect(maxRelErr(scores, f.scores)).toBeLessThan(1e-9);
    });
  }
});

describe('EvaluationFunction', () => {
  for (const [k, g] of (ref.genomes as { seed: number; genome: number[]; fitness: number; fitnessMain: number; fitnessKinesis: number }[]).entries()) {
    it(`fitness matches (genome ${k})`, () => {
      const worm = decodeWorm(g.genome, CircuitSize);
      expect(evaluateWorm(worm, defaultTrials, run, 'taxis', new RandomState(g.seed + 100))).toBeCloseTo(g.fitness, 10);
      // The untouched EvaluationFunction (uninitialized pastTheta) gives the same value here
      expect(g.fitnessMain).toBeCloseTo(g.fitness, 10);
      expect(evaluateWorm(worm, defaultTrials, run, 'kinesis', new RandomState(g.seed + 100))).toBeCloseTo(g.fitnessKinesis, 10);
    });
  }

  it('the agent module evaluates genomes like main.cpp', () => {
    const s = chemotaxisAgent.defaultParams();
    const e = chemotaxisAgent.defaultEvoConfig(s);
    const g = ref.genomes[1];
    expect(chemotaxisAgent.genomeSize(e)).toBe(93);
    expect(chemotaxisAgent.evaluate(Float64Array.from(g.genome), e, new RandomState(5))).toBeCloseTo(g.fitness, 10);
    expect(defaultRun.dt).toBe(0.01);
  });
});

describe('chemotaxis presets', () => {
  it('reproduce their recorded fitness and are not numerical artifacts', () => {
    for (const p of evolved as { name: string; fitness: number }[]) {
      const preset = chemotaxisAgent.presets.find((q) => q.name.startsWith(p.name))!;
      const s = preset.params();
      const fit = trialSetFitness(runAllTrials(s));
      expect(fit).toBeCloseTo(p.fitness, 10);
      // Half the step size (integration and sensor/speed windows rescale with dt)
      expect(Math.abs(refinedFitness(s) - fit)).toBeLessThan(0.05);
    }
  });

  it('the recording has the documented channels', () => {
    const s = chemotaxisAgent.defaultParams();
    const rec = chemotaxisAgent.simulate({ ...s, run: { ...s.run, transient: 20, evalDuration: 10 } });
    expect(rec.t.length).toBe(1 + Math.floor(2999 / s.run.sampleEvery));
    for (const c of chemotaxisAgent.channels(s)) expect(rec.channels[c.key], c.key).toBeDefined();
    expect(rec.channels.x[0]).toBe(-4.5);
  });
});
