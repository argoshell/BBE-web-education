// Runs named analysis jobs (src/sim/jobs.ts) off the main thread.

import { jobs, type JobName } from '../sim/jobs';

export interface JobRequest { id: number; job: JobName; args: unknown }
export interface JobResponse { id: number; result?: unknown; error?: string; ms: number }

self.onmessage = (ev: MessageEvent<JobRequest>) => {
  const { id, job, args } = ev.data;
  const t0 = performance.now();
  try {
    const fn = jobs[job] as (a: unknown) => unknown;
    if (!fn) throw new Error(`Unknown job ${job}`);
    const result = fn(args);
    (self as unknown as Worker).postMessage({ id, result, ms: performance.now() - t0 } satisfies JobResponse);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: String(e), ms: performance.now() - t0 } satisfies JobResponse);
  }
};
