// The site's dynamics analyses against Randall Beer's Dynamica (Mathematica), run in the
// Free Wolfram Engine by native/dynamica/run.sh (tests/fixtures/dynamica.json).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { equilibriumBranches, equilibriumPoints, findLimitCycle, type ParamFamily } from '../src/sim/analysis/dynamics';
import type { Complex } from '../src/sim/analysis/linalg';
import type { CTRNNParams } from '../src/sim/core/ctrnn';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ref: any = JSON.parse(readFileSync(new URL('./fixtures/dynamica.json', import.meta.url), 'utf8'));

interface RefEP { point: number[]; stability: string; type: string; eigenvalues: [number, number][] }

const circuitOf = (c: { taus: number[]; biases: number[]; gains: number[]; weights: number[] }): CTRNNParams => ({ size: c.taus.length, ...c });

/** Match each Dynamica equilibrium to one of ours: same point, classification and eigenvalues. */
function compareEquilibria(c: CTRNNParams, refEps: RefEP[]) {
  const ours = equilibriumPoints(c, new Array(c.size).fill(0));
  expect(ours.length).toBe(refEps.length);
  for (const r of refEps) {
    const m = ours.find((e) => e.y.every((v, i) => Math.abs(v - r.point[i]) < 1e-6));
    expect(m, `equilibrium ${r.point}`).toBeTruthy();
    expect(m!.stability).toBe(r.stability.toLowerCase());
    expect(m!.type).toBe(r.type.toLowerCase());
    const sortEv = (ev: Complex[]) => [...ev].sort((a, b) => a.re - b.re || a.im - b.im);
    const ev = sortEv(m!.eigenvalues), rev = sortEv(r.eigenvalues.map(([re, im]) => ({ re, im })));
    ev.forEach((e, i) => {
      expect(e.re).toBeCloseTo(rev[i].re, 6);
      expect(e.im).toBeCloseTo(rev[i].im, 6);
    });
  }
}

function compareCycle(c: CTRNNParams, r: { cycleStart: number[]; limitCycle: { period: number; stability: string; multipliers: [number, number][] } }) {
  const lc = findLimitCycle(c, new Array(c.size).fill(0), r.cycleStart, { settle: 20, maxPeriod: 200, h: 0.005 })!;
  expect(lc).toBeTruthy();
  expect(lc.period).toBeCloseTo(r.limitCycle.period, 4);
  expect(lc.stable).toBe(r.limitCycle.stability === 'Stable');
  const mags = (ms: number[][]) => ms.map(([re, im]) => Math.hypot(re, im)).sort((a, b) => b - a);
  const ours = mags(lc.multipliers.map((m) => [m.re, m.im])), theirs = mags(r.limitCycle.multipliers);
  ours.forEach((m, i) => expect(Math.abs(m - theirs[i])).toBeLessThan(1e-3));
}

describe('dynamics vs. Dynamica', () => {
  it('oscillator (SimpleCTRNNMain): equilibrium and limit cycle', () => {
    const c = circuitOf(ref.oscillator.circuit);
    compareEquilibria(c, ref.oscillator.equilibria);
    compareCycle(c, ref.oscillator);
  });

  it('bistable circuit: two stable nodes and a saddle', () => {
    compareEquilibria(circuitOf(ref.bistable.circuit), ref.bistable.equilibria);
  });

  it("Beer's cpg.ns walker circuit: equilibrium and walking limit cycle", () => {
    const c = circuitOf(ref.cpg.circuit);
    compareEquilibria(c, ref.cpg.equilibria);
    compareCycle(c, ref.cpg);
  });

  it('oscillator branches over theta_1: Hopf points at the same parameter values', () => {
    const base = circuitOf(ref.oscillator.circuit);
    const fam: ParamFamily = { circuit: (l) => ({ ...base, biases: [l, base.biases[1]] }), inputs: () => [0, 0] };
    const ours = equilibriumBranches(fam, -8, 4).flatMap((b) => b.bifurcations);
    const theirs = ref.oscillatorBranches.bifurcations as { type: string; parameters: number[] }[];
    expect(theirs.every((b) => b.type === 'Hopf')).toBe(true);
    for (const t of theirs) {
      const m = ours.find((b) => b.kind === 'hopf' && Math.abs(b.lambda - t.parameters[0]) < 1e-4);
      expect(m, `Hopf at ${t.parameters[0]}`).toBeTruthy();
    }
  });

  it('self-exciting neuron over its input: folds at the same parameter values', () => {
    const c = { size: 1, taus: [1], biases: [-4], gains: [1], weights: [8] };
    const fam: ParamFamily = { circuit: () => c, inputs: (l) => [l] };
    const ours = equilibriumBranches(fam, -3, 3).flatMap((b) => b.bifurcations);
    for (const t of ref.selfExcitingBranches.bifurcations as { type: string; parameters: number[] }[]) {
      expect(t.type).toBe('Fold');
      expect(ours.some((b) => b.kind === 'fold' && Math.abs(b.lambda - t.parameters[0]) < 1e-4), `fold at ${t.parameters[0]}`).toBe(true);
    }
  });
});

import { cycleBranches } from '../src/sim/analysis/cycles';
import { bialternate, bifurcationCurves } from '../src/sim/analysis/bifurcation2';
import { determinant, eigenvalues } from '../src/sim/analysis/linalg';
import { RandomState } from '../src/sim/core/random';

describe('limit-cycle branches vs. Dynamica', () => {
  const base = circuitOf(ref.oscillator.circuit);
  const fam: ParamFamily = { circuit: (l) => ({ ...base, biases: [l, base.biases[1]] }), inputs: () => [0, 0] };
  const eq = equilibriumBranches(fam, -8, 4);
  const [branch] = cycleBranches(fam, -8, 4, eq, [0, 0]);
  const pts = [...branch.points].sort((a, b) => a.lambda - b.lambda);

  it('the oscillator cycle branch runs from Hopf point to Hopf point', () => {
    const hopfs = (ref.oscillatorBranches.bifurcations as { parameters: number[] }[]).map((b) => b.parameters[0]).sort((a, b) => a - b);
    expect(Math.abs(pts[0].lambda - hopfs[0])).toBeLessThan(0.01);
    expect(Math.abs(pts[pts.length - 1].lambda - hopfs[1])).toBeLessThan(0.01);
    expect(pts.every((p) => p.stable)).toBe(true);
  });

  it('periods along the branch match Dynamica\'s FindLimitCycle at sampled parameter values', () => {
    for (const r of ref.oscillatorCycles as { lambda: number; period: number }[]) {
      const k = pts.findIndex((p) => p.lambda >= r.lambda);
      const a = pts[k - 1], b = pts[k];
      const T = a.period + ((r.lambda - a.lambda) / (b.lambda - a.lambda)) * (b.period - a.period);
      expect(Math.abs(T - r.period) / r.period).toBeLessThan(2e-3);
    }
  });
});

describe('two-parameter bifurcation curves vs. Dynamica', () => {
  const base = circuitOf(ref.oscillator.circuit);
  const { curves } = bifurcationCurves({ circuit: (a, b) => ({ ...base, biases: [a, b] }), inputs: () => [0, 0] }, { l1: [-8, 4], l2: [-8, 4] });
  const distTo = (kind: 'fold' | 'hopf', l1: number, l2: number) => Math.min(...curves.filter((c) => c.kind === kind).flatMap((c) => c.points.slice(1).map((p, k) => {
    const q = c.points[k], dx = p.l1 - q.l1, dy = p.l2 - q.l2, L = dx * dx + dy * dy;
    const s = L > 0 ? Math.max(0, Math.min(1, ((l1 - q.l1) * dx + (l2 - q.l2) * dy) / L)) : 0;
    return Math.hypot(l1 - (q.l1 + s * dx), l2 - (q.l2 + s * dy));
  })));

  it('every point of Dynamica\'s fold curves lies on one of ours', () => {
    const folds = (ref.oscillatorBifurcationCurves as { type: string; points: number[][] }[]).filter((c) => c.type === 'Fold');
    expect(folds.length).toBe(4);
    for (const c of folds) for (const p of c.points) expect(distTo('fold', p[2], p[3])).toBeLessThan(0.01);
  });

  it('the Hopf curve passes through Dynamica\'s one-parameter Hopf points (theta_2 = -1.75)', () => {
    for (const b of ref.oscillatorBranches.bifurcations as { parameters: number[] }[]) expect(distTo('hopf', b.parameters[0], -1.75)).toBeLessThan(1e-3);
  });

  it('det(2A (.) I) equals the product of pairwise eigenvalue sums', () => {
    const rs = new RandomState(4);
    for (const n of [2, 3, 4, 5]) {
      const A = Float64Array.from({ length: n * n }, () => rs.uniformRandom(-2, 2));
      const ev = eigenvalues(A, n);
      let pr = 1, pi = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const sr = ev[i].re + ev[j].re, si = ev[i].im + ev[j].im, r = pr * sr - pi * si;
        pi = pr * si + pi * sr; pr = r;
      }
      expect(determinant(bialternate(A, n), (n * (n - 1)) / 2)).toBeCloseTo(pr, 8);
    }
  });
});
