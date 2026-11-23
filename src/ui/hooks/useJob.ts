// Run a named analysis job (src/sim/jobs.ts) in a background worker, so slow analyses never freeze
// the page. Each hook owns one worker. While it is busy, newer requests replace any queued one
// (latest wins), so dragging a slider produces a stream of updates instead of a backlog. The last
// result stays visible, marked pending, until the result for the current inputs arrives.

import { useEffect, useRef, useState } from 'react';
import type { JobArgs, JobName, JobResult } from '../../sim/jobs';
import type { JobRequest, JobResponse } from '../../workers/analysis.worker';

export interface JobState<T> {
  /** Latest result (possibly for older inputs); undefined until the first one arrives. */
  value: T | undefined;
  /** True while the value shown was computed for other inputs than the current ones. */
  pending: boolean;
  error?: string;
  /** Duration of the last computation, ms. */
  ms?: number;
}

interface Done<T> { value: T | undefined; forArgs: unknown; error?: string; ms?: number }

/**
 * `args` must keep its identity while the inputs are unchanged (memoize it); pass null to skip.
 * `onResult` (optional) is called with each result and the arguments it was computed for.
 */
export function useJob<K extends JobName>(job: K, args: JobArgs<K> | null, onResult?: (result: JobResult<K>, args: JobArgs<K>) => void): JobState<JobResult<K>> {
  const [done, setDone] = useState<Done<JobResult<K>>>({ value: undefined, forArgs: undefined });
  const ref = useRef({ worker: null as Worker | null, busy: false, queued: null as JobArgs<K> | null, nextId: 0, sent: new Map<number, unknown>() });
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; });

  useEffect(() => () => {
    const r = ref.current;
    r.worker?.terminate();
    Object.assign(r, { worker: null, busy: false, queued: null });
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
      r.worker.postMessage({ id, job, args: a } satisfies JobRequest);
    };
    if (r.busy) r.queued = args; else send(args);
  }, [job, args]);

  return { value: done.value, pending: args !== null && done.forArgs !== args, error: done.error, ms: done.ms };
}
