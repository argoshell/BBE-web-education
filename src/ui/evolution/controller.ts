// Owns an evolutionary run outside React so it survives re-renders and page switches.

import type { AnyAgentModule } from '../../sim/agent';
import { TSearch, type GenerationRecord, type IndividualRecord, type SearchConfig } from '../../sim/core/tsearch';
import { WorkerPool } from '../../sim/workerPool';

export type RunStatus = 'idle' | 'running' | 'paused' | 'done' | 'loaded';

/** A run as stored in exported JSON. */
export interface RunFile {
  format: 'beer-web-run';
  version: 1;
  agentId: string;
  evoConfig: unknown;
  search: SearchConfig;
  individuals: { id: number; born: number; parents: number[]; perf: number; genome: number[] }[];
  generations: { gen: number; ids: number[]; perfs: number[]; best: number; avg: number; variance: number; bestId: number; bestSoFar: number; bestSoFarId: number }[];
}

/** Read-only view of a run, from a live TSearch or a loaded file. */
export interface RunData {
  agentId: string;
  evoConfig: unknown;
  search: SearchConfig;
  archive: Map<number, IndividualRecord>;
  generations: GenerationRecord[];
}

export function ancestry(run: RunData, id: number): IndividualRecord[] {
  const chain: IndividualRecord[] = [];
  let rec = run.archive.get(id);
  while (rec) {
    chain.push(rec);
    rec = rec.parents.length ? run.archive.get(rec.parents[0]) : undefined;
  }
  return chain.reverse();
}

export class EvolutionController {
  status: RunStatus = 'idle';
  run: RunData | null = null;
  error: string | null = null;
  evalsPerSecond = 0;
  private search: TSearch | null = null;
  private pool: WorkerPool | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private pending = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };

  getVersion = () => this.version;

  private notify(immediate = false) {
    if (immediate) { this.version++; this.listeners.forEach((f) => f()); return; }
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.version++;
      this.listeners.forEach((f) => f());
    });
  }

  get generation(): number {
    return this.run?.generations.length ? this.run.generations[this.run.generations.length - 1].gen : 0;
  }

  async start(agent: AnyAgentModule, evoConfig: unknown, search: Omit<SearchConfig, 'vectorSize'>) {
    this.reset();
    const vectorSize = agent.genomeSize(evoConfig);
    const config: SearchConfig = { ...search, vectorSize };
    this.pool ??= new WorkerPool();
    try {
      this.search = new TSearch(config, this.pool.evaluator(agent.id, evoConfig));
    } catch (e) {
      this.error = String(e);
      this.notify(true);
      return;
    }
    this.run = { agentId: agent.id, evoConfig, search: config, archive: this.search.archive, generations: this.search.generations };
    this.status = 'running';
    this.notify(true);
    await this.loop();
  }

  private async loop() {
    const s = this.search;
    if (!s) return;
    try {
      if (s.generations.length === 0) await s.initialize();
      this.notify();
      while (this.status === 'running' && !s.done && this.search === s) {
        const t0 = performance.now();
        await s.step();
        const dt = (performance.now() - t0) / 1000;
        this.evalsPerSecond = 0.8 * this.evalsPerSecond + (0.2 * s.populationSize) / Math.max(dt, 1e-6);
        this.notify();
      }
      if (this.search === s && s.done) { this.status = 'done'; this.notify(true); }
    } catch (e) {
      this.error = String(e);
      this.status = 'paused';
      this.notify(true);
    }
  }

  pause() {
    if (this.status === 'running') { this.status = 'paused'; this.notify(true); }
  }

  resume() {
    if (this.status === 'paused' && this.search) { this.status = 'running'; this.notify(true); void this.loop(); }
  }

  /** Extend a finished run by more generations. */
  extend(extra: number) {
    if (!this.search || this.status !== 'done') return;
    this.search.config.maxGenerations += extra;
    this.run!.search.maxGenerations = this.search.config.maxGenerations;
    this.status = 'running';
    this.notify(true);
    void this.loop();
  }

  reset() {
    this.search = null;
    this.run = null;
    this.status = 'idle';
    this.error = null;
    this.evalsPerSecond = 0;
    this.notify(true);
  }

  toFile(): RunFile | null {
    const r = this.run;
    if (!r) return null;
    return {
      format: 'beer-web-run',
      version: 1,
      agentId: r.agentId,
      evoConfig: r.evoConfig,
      search: r.search,
      individuals: [...r.archive.values()].map((i) => ({ id: i.id, born: i.born, parents: i.parents, perf: i.perf, genome: Array.from(i.genome) })),
      generations: r.generations.map((g) => ({ ...g, ids: Array.from(g.ids), perfs: Array.from(g.perfs) })),
    };
  }

  load(file: RunFile) {
    if (file.format !== 'beer-web-run') throw new Error('Not a beer-web run file');
    this.reset();
    const archive = new Map<number, IndividualRecord>();
    for (const i of file.individuals) archive.set(i.id, { ...i, genome: Float64Array.from(i.genome) });
    this.run = {
      agentId: file.agentId,
      evoConfig: file.evoConfig,
      search: file.search,
      archive,
      generations: file.generations.map((g) => ({ ...g, ids: Int32Array.from(g.ids), perfs: Float64Array.from(g.perfs) })),
    };
    this.status = 'loaded';
    this.notify(true);
  }
}

const controllers = new Map<string, EvolutionController>();

/** One controller per agent page. */
export function controllerFor(agentId: string): EvolutionController {
  let c = controllers.get(agentId);
  if (!c) { c = new EvolutionController(); controllers.set(agentId, c); }
  return c;
}
