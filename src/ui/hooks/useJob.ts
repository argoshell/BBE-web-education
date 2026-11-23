// Run a named analysis job (src/sim/jobs.ts) in a background worker, so slow analyses never freeze
// the page. Each hook owns one worker. While it is busy, newer requests replace any queued one
// (latest wins), so dragging a slider produces a stream of updates instead of a backlog. The last
// result stays visible, marked pending, until the result for the current inputs arrives.

import { useEffect, useRef, useState } from 'react';
import type { JobArgs, JobContext, JobName, JobResult } from '../../sim/jobs';
import type { JobRequest, JobResponse } from '../../workers/analysis.worker';

export interface JobState<T> {
  /** Latest result (possibly for older inputs); undefined until the first one arrives. */
  value: T | undefined;
  /** True while the value shown was computed for other inputs than the current ones. */
  pending: boolean;
  error?: string;
  /** Duration of the last computation, ms. */
  ms?: number;
  /** The arguments `value` was computed for (they may differ from the current ones while pending). */
  args?: unknown;
}

interface Done<T> { value: T | undefined; forArgs: unknown; error?: string; ms?: number }

export interface JobOptions<K extends JobName> {
  /** Called with each result and the arguments it was computed for. */
  onResult?: (result: JobResult<K>, args: JobArgs<K>) => void;
  /** Large data the job reads (an ensemble, a recording): posted to the worker only when its identity changes. */
  context?: JobContext<K>;
}

/** `args` (and `context`) must keep their identity while unchanged (memoize them); pass null args to skip. */
export function useJob<K extends JobName>(job: K, args: JobArgs<K> | null, opts: JobOptions<K> = {}): JobState<JobResult<K>> {
  const { onResult, context } = opts;
  const [done, setDone] = useState<Done<JobResult<K>>>({ value: undefined, forArgs: undefined });
  const ref = useRef({ worker: null as Worker | null, busy: false, queued: null as JobArgs<K> | null, nextId: 0, sent: new Map<number, unknown>(), contextSent: undefined as unknown, context: undefined as unknown });
  // Always post the latest context with the next request
  useEffect(() => { ref.current.context = context; });
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; });

  useEffect(() => () => {
    const r = ref.current;
    r.worker?.terminate();
    Object.assign(r, { worker: null, busy: false, queued: null, contextSent: undefined });
    r.sent.clear();
  }, []);

  useEffect(() => {
    if (args === null) return;
    const r = ref.current;
    const send = (a: JobArgs<K>) => {
      if (!r.worker) {
        r.worker = new Worker(new URL('../../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
        r.worker.onmessage = (ev: MessageEvent<JobResponse>) => {
          r.busy = false;
          const { id, result, error, ms } = ev.data;
          const forArgs = r.sent.get(id);
          r.sent.delete(id);
          setDone((d) => ({ value: error ? d.value : (result as JobResult<K>), forArgs, error, ms }));
          if (!error) onResultRef.current?.(result as JobResult<K>, forArgs as JobArgs<K>);
          if (r.queued !== null) { const q = r.queued; r.queued = null; send(q); }
        };
      }
      r.busy = true;
      const id = r.nextId++;
      r.sent.set(id, a);
      const hasContext = r.context !== r.contextSent;
      r.worker.postMessage({ id, job, args: a, ...(hasContext ? { context: r.context, hasContext: true } : {}) } satisfies JobRequest);
      r.contextSent = r.context;
    };
    r.context = context;
    if (r.busy) r.queued = args; else send(args);
  }, [job, args, context]);

  return { value: done.value, pending: args !== null && done.forArgs !== args, error: done.error, ms: done.ms, args: done.forArgs };
}
