// The visual agent port against Beer/Setzler's C++ (tests/fixtures/visual.json).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CTRNN } from '../src/sim/core/ctrnn';
import { RandomState } from '../src/sim/core/random';
import { BodySize, VisualAgent, VisualObject, type ObjectShape } from '../src/sim/agents/visual/body';

const ref = JSON.parse(readFileSync(new URL('./fixtures/visual.json', import.meta.url), 'utf8'));

function maxAbsErr(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

function runTrial(shape: ObjectShape, agentX: number, objX: number) {
  const a = new VisualAgent(CTRNN.fromParams(ref.circuit));
  const obj = new VisualObject(shape);
  a.reset(new RandomState(1), 0, 0, false);
  a.setPositionX(agentX);
  obj.cx = objX;
  obj.cy = 275;
  const ax: number[] = [], rays: number[] = [];
  const outs: number[][] = Array.from({ length: 14 }, () => []);
  while (obj.cy > BodySize / 2) {
    a.resetRays();
    for (const r of a.rays) { const c = { ...r }; obj.rayIntersection(c); rays.push(c.length); }
    a.step(0.1, obj);
    obj.step(0.1);
    ax.push(a.cx);
    for (let i = 0; i < 14; i++) outs[i].push(a.nervousSystem.outputs[i]);
  }
  return { ax, rays, outs, final: a.cx - objX };
}

describe('VisualAgent', () => {
  const names = Object.keys(ref).filter((k) => k !== 'circuit');
  for (const name of names) {
    it(`matches ${name}`, () => {
      const f = ref[name];
      const shape: ObjectShape = name.startsWith('line') ? 'line' : 'circle';
      const r = runTrial(shape, f.agentX0, f.objectX);
      expect(r.ax.length).toBe(f.steps);
      expect(maxAbsErr(r.rays, f.rays)).toBeLessThan(1e-9);
      expect(maxAbsErr(r.ax, f.agentX)).toBeLessThan(1e-9);
      for (let i = 0; i < 14; i++) expect(maxAbsErr(r.outs[i], f.outputs[i])).toBeLessThan(1e-9);
      expect(r.final).toBeCloseTo(f.finalDistance, 9);
    });
  }
});

import { runAllTrials, visualAgent } from '../src/sim/agents/visual';
import visualPresets from '../src/sim/agents/visual/evolvedPresets.json';

describe('visual presets', () => {
  it('evolved presets reproduce their recorded fitness', () => {
    for (const p of visualPresets as { name: string; fitness: number }[]) {
      const preset = visualAgent.presets.find((q) => q.name.startsWith(p.name))!;
      const r = runAllTrials(preset.params());
      expect(r.reduce((s, t) => s + t.score, 0) / r.length).toBeCloseTo(p.fitness, 12);
    }
  });
});
