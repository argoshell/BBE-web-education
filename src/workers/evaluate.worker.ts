// Evaluates batches of genomes for any registered agent module.

import { RandomState } from '../sim/core/random';
import type { EvalJob, EvalResult } from '../sim/core/tsearch';
import { agentModules } from '../sim/agents/registry';

export interface EvalRequest {
  id: number;
  agentId: string;
  config: unknown;
  jobs: EvalJob[];
}

export interface EvalResponse {
  id: number;
  results?: EvalResult[];
  error?: string;
}

self.onmessage = (ev: MessageEvent<EvalRequest>) => {
  const { id, agentId, config, jobs } = ev.data;
  try {
    const agent = agentModules[agentId];
    if (!agent) throw new Error(`Unknown agent ${agentId}`);
    const results = jobs.map((j) => {
      const rs = RandomState.fromSnapshot(j.rs);
      const perf = agent.evaluate(j.genome, config, rs);
      return { perf, rs: rs.snapshot() };
    });
    (self as unknown as Worker).postMessage({ id, results } satisfies EvalResponse);
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: String(e) } satisfies EvalResponse);
  }
};
