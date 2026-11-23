// Runs named analysis jobs (src/sim/jobs.ts) off the main thread.

import { jobs, type JobName } from '../sim/jobs';

/** `context` is sent only when it changes; the worker keeps the last one. */
export interface JobRequest { id: number; job: JobName; args: unknown; context?: unknown; hasContext?: boolean }
export interface JobResponse { id: number; result?: unknown; error?: string; ms: number }

let context: unknown;

self.onmessage = (ev: MessageEvent<JobRequest>) => {
  const { id, job, args } = ev.data;
  if (ev.data.hasContext) context = ev.data.context;
  const t0 = performance.now();
  try {
    const fn = jobs[job] as (a: unknown, c: unknown) => unknown;
    if (!fn) throw new Error(`Unknown job ${job}`);
    const result = fn(args, context);
    (self as unknown as Worker).postMessage({ id, result, ms: performance.now() - t0 } satisfies JobResponse);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: String(e), ms: performance.now() - t0 } satisfies JobResponse);
  }
};
