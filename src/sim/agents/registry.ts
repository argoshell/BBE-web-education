// All agent modules, by id. Imported by both the UI and the evaluation workers.

import type { AnyAgentModule } from '../agent';
import { leggedAgent } from './legged';

export const agentModules: Record<string, AnyAgentModule> = {
  [leggedAgent.id]: leggedAgent,
};
