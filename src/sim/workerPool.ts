// A pool of evaluation workers exposed as a TSearch BatchEvaluator. Results do not
// depend on the number of workers because each individual carries its own RandomState.

import type { BatchEvaluator, EvalJob, EvalResult } from './core/tsearch';
import type { EvalRequest, EvalResponse } from '../workers/evaluate.worker';

export class WorkerPool {
  private workers: Worker[] = [];
  private nextId = 0;
  private pending = new Map<number, { resolve: (r: EvalResult[]) => void; reject: (e: Error) => void }>();

  constructor(size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('../workers/evaluate.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<EvalResponse>) => {
        const p = this.pending.get(ev.data.id);
        if (!p) return;
        this.pending.delete(ev.data.id);
        if (ev.data.error) p.reject(new Error(ev.data.error));
        else p.resolve(ev.data.results!);
      };
      this.workers.push(w);
    }
  }

  get size(): number {
    return this.workers.length;
  }

  evaluator(agentId: string, config: unknown): BatchEvaluator {
    return async (jobs: EvalJob[]) => {
      const k = this.workers.length;
      const chunk = Math.ceil(jobs.length / k);
      const parts: Promise<EvalResult[]>[] = [];
      for (let w = 0; w < k && w * chunk < jobs.length; w++) {
        const slice = jobs.slice(w * chunk, (w + 1) * chunk);
        const id = this.nextId++;
        parts.push(
          new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.workers[w].postMessage({ id, agentId, config, jobs: slice } satisfies EvalRequest);
          }),
        );
      }
      return (await Promise.all(parts)).flat();
    };
  }

  terminate(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    for (const p of this.pending.values()) p.reject(new Error('Worker pool terminated'));
    this.pending.clear();
  }
}
