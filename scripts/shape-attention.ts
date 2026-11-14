// Evolve selective-attention agents with the incremental shaping of Slocum, Downey & Beer (2000) §6 and
// Goldenberg, Garcowski & Beer (2004):
//   - the evaluation set starts with 1 trial and grows to 35;
//   - a trial is added when the best agent's performance exceeds T = 198 − n/14 − gen/2500 (n = number of
//     trials, performance out of 200) or when 600 generations have passed without a change;
//   - a new trial is the first random trial on which the current best agent scores below 170;
//   - once there are 35 trials, a new trial replaces the one the best agent scores highest on.
// The population is re-evaluated every generation (the trial set changes). Evaluation runs in worker threads.
//
//   npx tsx scripts/shape-attention.ts --inter 4 --gens 9000 --seed 1 --workers 8 [--mutvar 1 --clip false] --out run.json

import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { RandomState } from '../src/sim/core/random';
import { defaultSearchConfig, TSearch, type BatchEvaluator } from '../src/sim/core/tsearch';
import { decode, genomeSize } from '../src/sim/agents/minimal/network';
import { slocumRanges } from '../src/sim/agents/minimal/memory';
import { attentionArch, attentionError, attentionPerformance, randomAttentionTrials, validTrial, type AttentionTrial } from '../src/sim/agents/minimal/attention';
import { runFalls } from '../src/sim/agents/minimal/body';
import { CTRNN } from '../src/sim/core/ctrnn';

const args = Object.fromEntries(
  process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const inter = Number(args.inter ?? 4), gens = Number(args.gens ?? 9000), seed = Number(args.seed ?? 1);
const nWorkers = Number(args.workers ?? Math.max(1, Math.floor(availableParallelism() / 4)));
const MAX_TRIALS = 35, STALL = 600, HARD = 170;
const arch = attentionArch(inter);

// ---- worker pool
const workers = Array.from({ length: nWorkers }, () => new Worker(new URL('./attention-worker.ts', import.meta.url), { execArgv: ['--import', 'tsx'], workerData: { inter } }));
let trials: AttentionTrial[] = [];
let jobId = 0;
function evalChunk(w: Worker, genomes: Float64Array[]): Promise<number[]> {
  const id = jobId++;
  return new Promise((resolve) => {
    const on = (m: { id: number; perfs: number[] }) => { if (m.id === id) { w.off('message', on); resolve(m.perfs); } };
    w.on('message', on);
    w.postMessage({ id, genomes, trials });
  });
}
const evaluator: BatchEvaluator = async (jobs) => {
  const per = Math.ceil(jobs.length / nWorkers);
  const parts = await Promise.all(workers.map((w, k) => evalChunk(w, jobs.slice(k * per, (k + 1) * per).map((j) => j.genome))));
  return parts.flat().map((perf, k) => ({ perf, rs: jobs[k].rs }));
};

// ---- shaping
const trialRs = new RandomState(1000 + seed);
function scores(genome: ArrayLike<number>): number[] {
  const ns = CTRNN.fromParams(decode(genome, arch, slocumRanges));
  return trials.map((t) => 200 - attentionError(runFalls(ns, { rays: 9, length: 205, angle: Math.PI / 6 }, 5, fallsOf(t), 0.1).dx));
}
function fallsOf(t: AttentionTrial) {
  return [{ x: t.x1, vx: t.vx1, vy: -t.vy1, y: 190 }, { x: t.x2, vx: t.vx2, vy: -t.vy2, y: 190 }];
}
/** First random (valid) trial on which the agent scores below 170. */
function hardTrial(genome: ArrayLike<number>): AttentionTrial {
  const ns = CTRNN.fromParams(decode(genome, arch, slocumRanges));
  for (let tries = 0; ; tries++) {
    const t = randomAttentionTrials(1, trialRs.uniformRandomInteger(1, 1e9))[0];
    if (!validTrial(t)) continue;
    const s = 200 - attentionError(runFalls(ns, { rays: 9, length: 205, angle: Math.PI / 6 }, 5, fallsOf(t), 0.1).dx);
    if (s < HARD || tries > 5000) return t;
  }
}

const search = {
  ...defaultSearchConfig,
  vectorSize: genomeSize(arch),
  populationSize: Number(args.pop ?? 100),
  maxGenerations: gens,
  seed,
  mutationVariance: Number(args.mutvar ?? defaultSearchConfig.mutationVariance),
  constrain: args.clip !== 'false',
  reEvaluate: true,
  elitistFraction: 0.02,
  crossoverProbability: 0,
};
// The first trial: a random one (the agent cannot be tested before the search starts)
trials = [randomAttentionTrials(1, 1000 + seed)[0]];
let lastChange = 0;
const s = new TSearch(search, evaluator);
const t0 = Date.now();
const log: string[] = [];
await s.run((g) => {
  const T = (198 - trials.length / 14 - g.gen / 2500) / 200;
  if (g.gen > 0 && (g.best > T || g.gen - lastChange >= STALL)) {
    const genome = s.archive.get(g.bestId)!.genome;
    const t = hardTrial(genome);
    let what: string;
    if (trials.length < MAX_TRIALS) { trials = [...trials, t]; what = `added trial ${trials.length}`; }
    else {
      const sc = scores(genome);
      const k = sc.indexOf(Math.max(...sc));
      trials = trials.map((x, j) => (j === k ? t : x));
      what = `replaced trial ${k + 1} (best scored ${sc[k].toFixed(1)})`;
    }
    const line = `gen ${g.gen}: best ${g.best.toFixed(4)} ${g.best > T ? `> T ${T.toFixed(4)}` : 'stalled'}; ${what}`;
    log.push(line);
    console.error(line);
    lastChange = g.gen;
  }
  if (g.gen % 250 === 0) console.error(`gen ${g.gen} best ${g.best.toFixed(4)} avg ${g.avg.toFixed(4)} trials ${trials.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
});
await Promise.all(workers.map((w) => w.terminate()));

// The final population's best on the final trial set; report generalization on 300 fresh random trials
const last = s.generations[s.generations.length - 1];
const genome = Array.from(s.archive.get(last.bestId)!.genome);
const circuit = decode(genome, arch, slocumRanges);
const random300 = attentionPerformance({ arch, circuit }, randomAttentionTrials(300, 2004), 0.1);
console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s; final best ${last.best.toFixed(4)} on ${trials.length} shaped trials; random 300: ${random300.toFixed(4)}`);
const out = { agent: 'attention', seed, fitness: last.best, random300, evo: { inter, shaped: true, search }, trials, log, genome };
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 1));
else console.log(JSON.stringify(out));
