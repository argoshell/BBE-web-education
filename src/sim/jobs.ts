// Named analysis jobs that run in a background worker (src/workers/analysis.worker.ts) so slow
// computations never freeze the page. Every job takes and returns structured-cloneable data.

import { detailOverTime, infoOverTime, laggedMI, type Ensemble, type InfoOptions } from './analysis/information';
import { equilibriumBranches, equilibriumPoints, findLimitCycle, type Branch } from './analysis/dynamics';
import { cycleBranches } from './analysis/cycles';
import { setParam } from './core/circuitParams';
import type { CTRNNParams } from './core/ctrnn';
import { RandomState } from './core/random';
import { runAllTrials as runAllVisualTrials, type VisualState } from './agents/visual';
import { visualEnsemble } from './agents/visual/ensemble';
import { meanScore, runAllGuidedTrials, type GuidedState, type TrialGrid } from './agents/visual/guided';
import { guidedEnsemble } from './agents/visual/guidedEnsemble';
import { relcatEnsemble, runAllRelcatTrials, type RelcatState } from './agents/relcat';
import { refinedFitness as refinedChemoFitness, runAllTrials as runAllChemoTrials, trialSetFitness, type ChemoState } from './agents/chemotaxis';
import { effectiveCircuit, mapCell, refinedFitness, setParam as setOscParam, type MapCell, type MapMetric, type OscState, type ParamKey } from './agents/oscillator';
import { bifurcationCurves } from './analysis/bifurcation2';
import { orientEvalTrials, orientPerformance, randomOrientTrials, runOrientTrials, type OrientState } from './agents/minimal/orientation';
import { memoryEvalTrials, memoryPerformance, randomMemoryTrials, runMemoryTrials, type MemoryState } from './agents/minimal/memory';
import { attentionPerformance, randomAttentionTrials, runAttentionTrials, type AttentionState } from './agents/minimal/attention';
import { attentionEnsemble, memoryEnsemble, orientationEnsemble } from './agents/minimal/ensembles';
import { forgettingCurve, learningFitness, learningMap, stages, strobes, type LearningState } from './agents/learning';

/** A one-parameter family that can cross to a worker: vary one parameter of a circuit, inputs fixed. */
export interface FamilySpec { circuit: CTRNNParams; key: string; inputs: number[] }

export function familyOf(f: FamilySpec) {
  return { circuit: (l: number) => setParam(f.circuit, f.key, l), inputs: () => f.inputs };
}

export const jobs = {
  // ---- Dynamics card
  'dynamics.point': (a: { circuit: CTRNNParams; inputs: number[]; state: number[] }) => ({
    eps: equilibriumPoints(a.circuit, a.inputs),
    lc: findLimitCycle(a.circuit, a.inputs, a.state),
  }),
  'dynamics.branches': (a: { family: FamilySpec; range: [number, number] }): Branch[] => {
    try { return equilibriumBranches(familyOf(a.family), a.range[0], a.range[1]); } catch { return []; }
  },
  'dynamics.cycles': (a: { family: FamilySpec; range: [number, number]; branches: Branch[]; state: number[] }) => {
    try { return cycleBranches(familyOf(a.family), a.range[0], a.range[1], a.branches, a.state); } catch { return []; }
  },
  'dynamics.envelope': (a: { family: FamilySpec; range: [number, number]; state: number[]; neuron: number }) => {
    const fam = familyOf(a.family), out: { l: number; lo: number; hi: number }[] = [];
    const S = 40, k = a.neuron;
    for (let s = 0; s <= S; s++) {
      const l = a.range[0] + ((a.range[1] - a.range[0]) * s) / S;
      const c = fam.circuit(l), I = fam.inputs();
      const lc = findLimitCycle(c, I, a.state, { settle: 100, maxPeriod: 200, h: Math.min(0.05, Math.min(...c.taus) / 20) });
      if (lc) {
        let lo = 1, hi = 0;
        for (const y of lc.trajectory) {
          const o = 1 / (1 + Math.exp(-c.gains[k] * (y[k] + c.biases[k])));
          lo = Math.min(lo, o); hi = Math.max(hi, o);
        }
        if (hi - lo > 1e-3) out.push({ l, lo, hi });
      }
    }
    return out;
  },

  // ---- information panels (the ensemble or recording is the hook's context, sent to the worker once)
  'info.over': (a: { stim: number; opts: InfoOptions }, e: Ensemble) => infoOverTime(e, a.stim, a.opts),
  'info.detail': (a: { stim: number; a: number; b: number; opts: InfoOptions }, e: Ensemble) => detailOverTime(e, a.stim, a.a, a.b, a.opts),
  'info.lagged': (a: { keys: string[]; target: string; lags: number[]; bins: number; from: number }, ch: Record<string, Float64Array>) => ({
    rows: a.keys.map((k) => laggedMI(ch[k], ch[a.target], a.lags, a.bins, a.from)),
    hT: laggedMI(ch[a.target], ch[a.target], [0], a.bins, a.from)[0],
  }),

  // ---- page summaries
  'visual.trials': (s: VisualState) => runAllVisualTrials(s),
  'visual.ensemble': (a: { state: VisualState; perShape: number }) => visualEnsemble(a.state, { perShape: a.perShape }),
  'guided.trials': (s: GuidedState) => {
    const results = runAllGuidedTrials(s);
    const other = s.task === 'size' ? 'aperture' : 'size';
    return { results, otherFitness: meanScore(runAllGuidedTrials({ ...s, task: other }, 1000)) };
  },
  /** Fitness on both tasks for each pinned circuit. */
  'guided.pinScores': (states: GuidedState[]) => states.map((s) => ({
    size: meanScore(runAllGuidedTrials({ ...s, task: 'size' }, 1000)), aperture: meanScore(runAllGuidedTrials({ ...s, task: 'aperture' }, 1000)),
  })),
  'guided.ensemble': (a: { state: GuidedState; grid: TrialGrid }) => guidedEnsemble(a.state, a.grid),
  'relcat.trials': (s: RelcatState) => runAllRelcatTrials(s),
  'relcat.ensemble': (a: { state: RelcatState; sizes: number[] }) => relcatEnsemble(a.state, a.sizes),
  'chemotaxis.trials': (s: ChemoState) => { const results = runAllChemoTrials(s); return { results, fitness: trialSetFitness(results) }; },
  'chemotaxis.pinFits': (states: ChemoState[]) => states.map((s) => trialSetFitness(runAllChemoTrials(s))),
  'chemotaxis.refined': (s: ChemoState) => refinedChemoFitness(s),
  'oscillator.refined': (s: OscState) => refinedFitness(s),
  /** Rows [row0, row1) of the two-parameter map (requested in slices so the map fills in progressively). */
  'oscillator.mapRows': (a: { state: OscState; x: ParamKey; y: ParamKey; xr: [number, number]; yr: [number, number]; metric: MapMetric; res: number; row0: number; row1: number }) => {
    const out: MapCell[] = [];
    for (let row = a.row0; row < a.row1; row++) {
      const yv = a.yr[0] + ((a.yr[1] - a.yr[0]) * (row + 0.5)) / a.res;
      for (let k = 0; k < a.res; k++) out.push(mapCell(a.state, a.x, a.xr[0] + ((a.xr[1] - a.xr[0]) * (k + 0.5)) / a.res, a.y, yv, a.metric));
    }
    return out;
  },
  'oscillator.curves': (a: { state: OscState; x: ParamKey; y: ParamKey; xr: [number, number]; yr: [number, number] }) => {
    const base = effectiveCircuit(a.state), zeros = new Array(base.size).fill(0);
    try { return bifurcationCurves({ circuit: (u, v) => setOscParam(setOscParam(base, a.x, u), a.y, v), inputs: () => zeros }, { l1: a.xr, l2: a.yr }); } catch { return null; }
  },
  'orientation.summary': (s: OrientState) => ({
    evalPerf: orientPerformance(s, orientEvalTrials, s.dt),
    randomPerf: orientPerformance(s, randomOrientTrials(100, 1996), s.dt),
    results: runOrientTrials(s, orientEvalTrials),
  }),
  'orientation.ensemble': (s: OrientState) => orientationEnsemble(s, 200, s.dt),
  'memory.summary': (s: MemoryState) => {
    const evalTrials = memoryEvalTrials(s.task), randomTrials = randomMemoryTrials(s.task, 200, 2000);
    return {
      evalPerf: memoryPerformance(s, s.task, evalTrials, s.dt, s.blindAfter),
      results: runMemoryTrials(s, evalTrials),
      randomResults: runMemoryTrials(s, randomTrials),
      randomPerf: memoryPerformance(s, s.task, randomTrials, s.dt, s.blindAfter),
    };
  },
  'memory.ensemble': (s: MemoryState) => memoryEnsemble(s, 200),
  'attention.summary': (a: { state: AttentionState; trials: number; seed: number }) => ({
    evalPerf: attentionPerformance(a.state, randomAttentionTrials(a.trials, a.seed), a.state.dt),
    tests: runAttentionTrials(a.state, randomAttentionTrials(300, 2004)),
  }),
  'attention.ensemble': (s: AttentionState) => attentionEnsemble(s, 300, s.dt),
  'learning.summary': (s: LearningState) => ({
    stage4: learningFitness(s, s.mode, stages[3], 100, s.dt, new RandomState(7)),
    map: learningMap(s, 21, s.dt),
    forgetting: forgettingCurve(s, s.mode, 12, 120, s.dt),
    strobes: strobes(s, s.mode, 60, s.dt),
  }),
};

export type JobName = keyof typeof jobs;
export type JobArgs<K extends JobName> = Parameters<(typeof jobs)[K]>[0];
/** Large data a job reads besides its arguments (sent to the worker only when it changes). */
export type JobContext<K extends JobName> = Parameters<(typeof jobs)[K]> extends [unknown, infer C] ? C : undefined;
export type JobResult<K extends JobName> = ReturnType<(typeof jobs)[K]>;
