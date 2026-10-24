// All agent modules, by id. Imported by both the UI and the evaluation workers.

import type { AnyAgentModule } from '../agent';
import { chemotaxisAgent } from './chemotaxis';
import { leggedAgent } from './legged';
import { oscillatorAgent } from './oscillator';
import { visualAgent } from './visual';
import { guidedAgent } from './visual/guided';

export const agentModules: Record<string, AnyAgentModule> = {
  [leggedAgent.id]: leggedAgent,
  [visualAgent.id]: visualAgent,
  [guidedAgent.id]: guidedAgent,
  [oscillatorAgent.id]: oscillatorAgent,
  [chemotaxisAgent.id]: chemotaxisAgent,
};
