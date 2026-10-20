// Port of Beer's TSearch (TSearch.cpp) with two additions:
//  1. Lineage: every individual gets an id and its parents are recorded.
//  2. Batch evaluation is async, so it can be farmed out to Web Workers.
//
// Every random draw happens in the same order as in the C++ so that, given the same
// seed, a search reproduces the reference implementation. In the C++, crossover
// decisions (ProbabilisticChoice) use the process-global random state; here that is a
// separate stream, `globalRs`, seeded with 0 just as the C++ global state is at startup.

import { LONG_MAX, RandomState, type RandomStateSnapshot } from './random';

export const MinSearchValue = -1.0;
export const MaxSearchValue = 1.0;

export function clip(x: number, min: number, max: number): number {
  const temp = x > min ? x : min;
  return temp < max ? temp : max;
}

/** Map a search parameter in [-1, 1] to [min, max], optionally clipped. */
export function mapSearchParameter(x: number, min: number, max: number, clipmin = -1.0e99, clipmax = 1.0e99): number {
  const m = (max - min) / (MaxSearchValue - MinSearchValue);
  const b = min - m * MinSearchValue;
  return clip(m * x + b, clipmin, clipmax);
}

export function inverseMapSearchParameter(x: number, min: number, max: number): number {
  const m = (MaxSearchValue - MinSearchValue) / (max - min);
  const b = MinSearchValue - m * min;
  return m * x + b;
}

export type SelectionMode = 'rank' | 'fitprop';
export type ReproductionMode = 'hill' | 'ga';
export type CrossoverMode = 'uniform' | 'twopoint';

export interface SearchConfig {
  vectorSize: number;
  populationSize: number;
  maxGenerations: number;
  seed: number;
  selection: SelectionMode;
  reproduction: ReproductionMode;
  crossover: CrossoverMode;
  elitistFraction: number;
  maxExpectedOffspring: number;
  mutationVariance: number;
  crossoverProbability: number;
  /** Clip search values to [-1, 1] after mutation. */
  constrain: boolean;
  reEvaluate: boolean;
  /** Optional crossover template (1-based module numbers, as in TSearch). */
  crossoverTemplate?: number[];
}

export const defaultSearchConfig: Omit<SearchConfig, 'vectorSize'> = {
  populationSize: 96,
  maxGenerations: 250,
  seed: 1,
  selection: 'rank',
  reproduction: 'ga',
  crossover: 'twopoint',
  elitistFraction: 0.02,
  maxExpectedOffspring: 1.1,
  mutationVariance: 0.05,
  crossoverProbability: 0.0,
  constrain: true,
  reEvaluate: false,
};

export interface EvalJob {
  genome: Float64Array;
  rs: RandomStateSnapshot;
}
export interface EvalResult {
  perf: number;
  rs: RandomStateSnapshot;
}
export type BatchEvaluator = (jobs: EvalJob[]) => Promise<EvalResult[]>;

/** Wrap a synchronous evaluation function as a BatchEvaluator. */
export function localEvaluator(fn: (genome: Float64Array, rs: RandomState) => number): BatchEvaluator {
  return async (jobs) =>
    jobs.map((j) => {
      const rs = RandomState.fromSnapshot(j.rs);
      const perf = fn(j.genome, rs);
      return { perf, rs: rs.snapshot() };
    });
}

export interface IndividualRecord {
  id: number;
  /** Generation in which this individual was created (0 = initial population). */
  born: number;
  /** 0 parents for generation 0, 1 for mutation, 2 for crossover. */
  parents: number[];
  genome: Float64Array;
  /** Performance at first evaluation. */
  perf: number;
}

export interface GenerationRecord {
  gen: number;
  /** Individual ids in population order after this generation was evaluated. */
  ids: Int32Array;
  perfs: Float64Array;
  best: number;
  avg: number;
  variance: number;
  /** Best individual in this generation's population. */
  bestId: number;
  /** Best-so-far performance (TSearch BestPerformance). */
  bestSoFar: number;
  bestSoFarId: number;
}

export class TSearch {
  readonly config: SearchConfig;
  private rs: RandomState;
  private globalRs = new RandomState(0);
  private randomStates: RandomState[] = [];
  gen = 0;
  population: Float64Array[] = [];
  ids: number[] = [];
  perf: number[] = [];
  private fitness: number[] = [];
  bestPerf = -1;
  bestVector: Float64Array;
  bestId = -1;
  minPerf = 0;
  maxPerf = 0;
  avgPerf = 0;
  perfVar = 0;
  private crossPoints: number[] = [];
  private nextId = 0;
  private initialized = false;

  readonly archive = new Map<number, IndividualRecord>();
  readonly generations: GenerationRecord[] = [];

  private evaluator: BatchEvaluator;

  constructor(config: SearchConfig, evaluator: BatchEvaluator) {
    this.evaluator = evaluator;
    this.config = { ...config };
    const n = config.vectorSize;
    if (n <= 0) throw new Error(`Invalid vector size: ${n}`);
    this.bestVector = new Float64Array(n);
    // Reproduce the C++ construction order: the constructor's default random state
    // (seed 0) seeds one individual's state, then SetRandomSeed and SetPopulationSize.
    this.rs = new RandomState(0);
    this.setPopulationSize(1);
    this.rs.setRandomSeed(config.seed);
    this.setPopulationSize(config.populationSize);
    this.setCrossoverTemplate(config.crossoverTemplate ?? Array.from({ length: n }, (_, i) => i + 1));
  }

  get populationSize(): number {
    return this.population.length;
  }

  get done(): boolean {
    return this.gen >= this.config.maxGenerations;
  }

  private setPopulationSize(n: number): void {
    this.population = Array.from({ length: n }, () => new Float64Array(this.config.vectorSize));
    this.ids = new Array(n).fill(-1);
    this.perf = new Array(n).fill(0);
    this.fitness = new Array(n).fill(0);
    this.randomStates = [];
    for (let i = 0; i < n; i++)
      this.randomStates.push(new RandomState(this.rs.uniformRandomInteger(1, LONG_MAX)));
  }

  private setCrossoverTemplate(t: number[]): void {
    let x = 1;
    for (let i = 0; i < t.length; i++)
      if (t[i] !== x) {
        if (t[i] === x + 1) x++;
        else throw new Error('Invalid crossover template');
      }
    // crossPoints are 1-based positions as in the C++
    this.crossPoints = [1];
    x = 1;
    for (let i = 1; i <= t.length; i++) if (t[i - 1] !== x) { this.crossPoints.push(i); x++; }
  }

  // ---------------------------------------------------------------- lineage

  private newIndividual(slot: number, parents: number[]): void {
    const id = this.nextId++;
    this.ids[slot] = id;
    this.archive.set(id, { id, born: this.gen, parents, genome: this.population[slot], perf: NaN });
  }

  /** Record the first evaluation of each newly created individual. */
  private recordPerfs(): void {
    for (let i = 0; i < this.populationSize; i++) {
      const rec = this.archive.get(this.ids[i]);
      if (rec && Number.isNaN(rec.perf)) {
        rec.perf = this.perf[i];
        rec.genome = this.population[i].slice();
      }
    }
  }

  private pushGenerationRecord(): void {
    let bestSlot = 0;
    for (let i = 1; i < this.populationSize; i++) if (this.perf[i] > this.perf[bestSlot]) bestSlot = i;
    this.generations.push({
      gen: this.gen,
      ids: Int32Array.from(this.ids),
      perfs: Float64Array.from(this.perf),
      best: this.maxPerf,
      avg: this.avgPerf,
      variance: this.perfVar,
      bestId: this.ids[bestSlot],
      bestSoFar: this.bestPerf,
      bestSoFarId: this.bestId,
    });
  }

  /** Ancestor chain of an individual, following first parents back to generation 0. */
  ancestry(id: number): IndividualRecord[] {
    const chain: IndividualRecord[] = [];
    let rec = this.archive.get(id);
    while (rec) {
      chain.push(rec);
      rec = rec.parents.length ? this.archive.get(rec.parents[0]) : undefined;
    }
    return chain.reverse();
  }

  // ---------------------------------------------------------------- search loop

  /** InitializeSearch + evaluation of the initial population (DoSearch preamble). */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.gen = 0;
    for (let i = 0; i < this.populationSize; i++) {
      const v = this.population[i];
      for (let k = 0; k < v.length; k++) v[k] = this.rs.uniformRandom(MinSearchValue, MaxSearchValue);
      this.newIndividual(i, []);
    }
    this.initialized = true;
    await this.evaluatePopulation(0);
    this.bestPerf = -1;
    this.updatePopulationStatistics();
    this.recordPerfs();
    this.pushGenerationRecord();
  }

  /** One generation of the DoSearch loop. */
  async step(): Promise<GenerationRecord> {
    if (!this.initialized) await this.initialize();
    this.gen++;
    if (this.config.reproduction === 'hill') await this.reproduceHillClimbing();
    else await this.reproduceGeneticAlgorithm();
    this.updatePopulationStatistics();
    this.recordPerfs();
    this.pushGenerationRecord();
    return this.generations[this.generations.length - 1];
  }

  /** Run to completion. Return false from onGeneration to stop early. */
  async run(onGeneration?: (g: GenerationRecord) => boolean | void): Promise<void> {
    await this.initialize();
    if (onGeneration?.(this.generations[0]) === false) return;
    while (!this.done) {
      const g = await this.step();
      if (onGeneration?.(g) === false) return;
    }
  }

  private async evaluatePopulation(start: number): Promise<void> {
    const jobs: EvalJob[] = [];
    for (let i = start; i < this.populationSize; i++)
      jobs.push({ genome: this.population[i], rs: this.randomStates[i].snapshot() });
    const results = await this.evaluator(jobs);
    for (let k = 0; k < results.length; k++) {
      const i = start + k;
      const p = results[k].perf;
      this.perf[i] = p < 0 ? 0 : p;
      this.randomStates[i].restore(results[k].rs);
    }
  }

  private updatePopulationStatistics(): void {
    const n = this.populationSize;
    let total = 0, bestindex = 0;
    this.minPerf = 1e10;
    this.maxPerf = -1e10;
    for (let i = 0; i < n; i++) {
      const p = this.perf[i];
      if (p > this.maxPerf) { this.maxPerf = p; bestindex = i; }
      if (p < this.minPerf) this.minPerf = p;
      total += p;
    }
    this.avgPerf = total / n;
    if (this.avgPerf < this.minPerf) this.avgPerf = this.minPerf;
    if (this.avgPerf > this.maxPerf) this.avgPerf = this.maxPerf;
    if (n > 1) {
      total = 0;
      for (let i = 0; i < n; i++) { const d = this.perf[i] - this.avgPerf; total += d * d; }
      this.perfVar = total / (n - 1);
    } else this.perfVar = 0.0;
    if (this.maxPerf > this.bestPerf || this.config.reEvaluate) {
      this.bestPerf = this.maxPerf;
      this.bestVector = this.population[bestindex].slice();
      this.bestId = this.ids[bestindex];
    }
  }

  // ---------------------------------------------------------------- selection

  private sortPopulation(): void {
    const perf = this.perf, pop = this.population, ids = this.ids;
    const swap = (a: number, b: number) => {
      let t: number = perf[a]; perf[a] = perf[b]; perf[b] = t;
      const tv = pop[a]; pop[a] = pop[b]; pop[b] = tv;
      t = ids[a]; ids[a] = ids[b]; ids[b] = t;
    };
    const partition = (first: number, last: number): number => {
      let pivot = first;
      const pivotValue = perf[first];
      for (let i = first; i <= last; i++)
        if (perf[i] > pivotValue) {
          pivot++;
          if (i !== pivot) swap(pivot, i);
        }
      swap(pivot, first);
      return pivot;
    };
    const quicksort = (first: number, last: number): void => {
      if (first < last) {
        const p = partition(first, last);
        quicksort(first, p - 1);
        quicksort(p + 1, last);
      }
    };
    quicksort(0, this.populationSize - 1);
  }

  private updatePopulationFitness(): void {
    const n = this.populationSize, c = this.config;
    this.sortPopulation();
    if (c.selection === 'fitprop') {
      const m = linearScaleFactor(this.minPerf, this.maxPerf, this.avgPerf, c.maxExpectedOffspring);
      let total = 0;
      for (let i = 0; i < n; i++) {
        this.fitness[i] = m * (this.perf[i] - this.avgPerf) + this.avgPerf;
        total = total + this.fitness[i];
      }
      for (let i = 0; i < n; i++) this.fitness[i] = this.fitness[i] / total;
    } else {
      const E = c.maxExpectedOffspring;
      for (let i = 0; i < n; i++) this.fitness[i] = (E + (2.0 - 2.0 * E) * (i / (n - 1))) / n;
    }
  }

  // ---------------------------------------------------------------- operators

  private mutateVector(v: Float64Array): void {
    const n = this.config.vectorSize;
    const magnitude = this.rs.gaussianRandom(0.0, this.config.mutationVariance);
    const temp = new Float64Array(n);
    this.rs.randomUnitVector(temp);
    for (let i = 0; i < n; i++)
      if (this.config.constrain) v[i] = clip(v[i] + magnitude * temp[i], MinSearchValue, MaxSearchValue);
      else v[i] = v[i] + magnitude * temp[i];
  }

  private uniformCrossover(v1: Float64Array, v2: Float64Array): void {
    const cp = this.crossPoints, n = this.config.vectorSize;
    if (cp.length < 2) return;
    for (let i = 0; i < cp.length - 1; i++)
      if (this.globalRs.probabilisticChoice(0.5))
        for (let j = cp[i]; j < cp[i + 1]; j++) { const t = v1[j - 1]; v1[j - 1] = v2[j - 1]; v2[j - 1] = t; }
    if (this.globalRs.probabilisticChoice(0.5))
      for (let j = cp[cp.length - 1]; j <= n; j++) { const t = v1[j - 1]; v1[j - 1] = v2[j - 1]; v2[j - 1] = t; }
  }

  private twoPointCrossover(v1: Float64Array, v2: Float64Array): void {
    const cp = this.crossPoints;
    if (cp.length < 2) return;
    let i1 = this.rs.uniformRandomInteger(1, cp.length);
    let i2 = i1;
    while (i2 === i1) i2 = this.rs.uniformRandomInteger(1, cp.length);
    if (i1 > i2) { const t = i1; i1 = i2; i2 = t; }
    for (let i = cp[i1 - 1]; i < cp[i2 - 1]; i++) { const t = v1[i - 1]; v1[i - 1] = v2[i - 1]; v2[i - 1] = t; }
  }

  // ---------------------------------------------------------------- reproduction

  private async reproduceHillClimbing(): Promise<void> {
    const n = this.populationSize;
    this.updatePopulationFitness();
    // Baker's stochastic universal sampling
    const parents: Float64Array[] = new Array(n);
    const parentIds: number[] = new Array(n);
    let parentPerf: number[] = new Array(n);
    let j = 0, sum = 0;
    let rand = this.rs.uniformRandom(0.0, 1.0);
    for (let i = 0; i < n && j < n; i++) {
      sum += n * this.fitness[i];
      while (rand < sum) {
        parents[j] = this.population[i];
        parentIds[j] = this.ids[i];
        parentPerf[j] = this.perf[i];
        j++;
        rand++;
      }
    }
    this.population = parents.map((v) => v.slice());
    this.ids = parentIds.slice();
    if (this.config.reEvaluate) {
      this.bestPerf = -1;
      await this.evaluatePopulation(0);
      parentPerf = this.perf.slice();
    }
    for (let i = 0; i < n; i++) {
      this.mutateVector(this.population[i]);
      this.newIndividual(i, [parentIds[i]]);
    }
    await this.evaluatePopulation(0);
    for (let i = 0; i < n; i++)
      if (parentPerf[i] > this.perf[i]) {
        this.archive.delete(this.ids[i]);
        this.population[i] = parents[i].slice();
        this.ids[i] = parentIds[i];
        this.perf[i] = parentPerf[i];
      }
  }

  private async reproduceGeneticAlgorithm(): Promise<void> {
    const n = this.populationSize, c = this.config;
    this.updatePopulationFitness();
    const elitePop = Math.floor(c.elitistFraction * n + 0.5);
    const tempPop = this.population.map((v) => v.slice());
    const tempIds = this.ids.slice();
    let j = elitePop, sum = 0;
    let rand = this.rs.uniformRandom(0.0, 1.0);
    for (let i = 0; i < n && j < n; i++) {
      sum += (n - elitePop) * this.fitness[i];
      while (rand < sum) {
        this.population[j] = tempPop[i].slice();
        this.ids[j] = tempIds[i];
        j++;
        rand++;
      }
    }
    // Shuffle the non-elite parents before crossover
    if (c.crossoverProbability > 0) {
      for (let i = elitePop + 1; i <= n; i++) {
        const k = this.rs.uniformRandomInteger(i, n);
        const tv = this.population[k - 1]; this.population[k - 1] = this.population[i - 1]; this.population[i - 1] = tv;
        const ti = this.ids[k - 1]; this.ids[k - 1] = this.ids[i - 1]; this.ids[i - 1] = ti;
      }
    }
    // Mutation or crossover for each non-elite parent
    let i = elitePop;
    while (i < n) {
      if (this.globalRs.probabilisticChoice(c.crossoverProbability) && i < n - 1) {
        const parent1 = this.population[i].slice();
        const parent2 = this.population[i + 1].slice();
        const p1 = this.ids[i], p2 = this.ids[i + 1];
        if (c.crossover === 'uniform') this.uniformCrossover(this.population[i], parent2);
        else this.twoPointCrossover(this.population[i], parent2);
        if (equalVector(this.population[i], parent1)) {
          this.mutateVector(this.population[i]);
          this.newIndividual(i, [p1]);
        } else this.newIndividual(i, [p1, p2]);
        i++;
      } else {
        const p = this.ids[i];
        this.mutateVector(this.population[i]);
        this.newIndividual(i, [p]);
        i++;
      }
    }
    if (c.reEvaluate) await this.evaluatePopulation(0);
    else await this.evaluatePopulation(elitePop);
  }
}

function equalVector(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Goldberg's linear fitness scaling coefficient. */
function linearScaleFactor(min: number, max: number, avg: number, fMultiple: number): number {
  if (min > (fMultiple * avg - max) / (fMultiple - 1)) {
    const delta = max - avg;
    return delta > 0.0 ? ((fMultiple - 1) * avg) / delta : 0.0;
  }
  const delta = avg - min;
  return delta > 0.0 ? avg / delta : 0.0;
}
