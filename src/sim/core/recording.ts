// A time series of named channels produced by simulating an agent.

export interface ChannelSpec {
  key: string;
  label: string;
  group: string;
  /** Optional fixed display range. */
  range?: [number, number];
}

export interface Recording {
  /** Time of each sample. Sample 0 is the initial state. */
  t: Float64Array;
  channels: Record<string, Float64Array>;
  /** Scalar results, e.g. fitness or average velocity. */
  summary: Record<string, number>;
}

/** Collects samples into growable arrays, then freezes them into a Recording. */
export class Recorder {
  private t: number[] = [];
  private data: Record<string, number[]> = {};

  constructor(private keys: string[]) {
    for (const k of keys) this.data[k] = [];
  }

  push(t: number, values: Record<string, number>): void {
    this.t.push(t);
    for (const k of this.keys) this.data[k].push(values[k]);
  }

  finish(summary: Record<string, number> = {}): Recording {
    const channels: Record<string, Float64Array> = {};
    for (const k of this.keys) channels[k] = Float64Array.from(this.data[k]);
    return { t: Float64Array.from(this.t), channels, summary };
  }
}

/** Index of the sample nearest to time t (samples assumed increasing). */
export function sampleIndex(rec: Recording, t: number): number {
  const ts = rec.t;
  if (ts.length === 0) return 0;
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  return Math.abs(ts[hi] - t) < Math.abs(ts[lo] - t) ? hi : lo;
}
