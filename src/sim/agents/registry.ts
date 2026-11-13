// All agent modules, by id. Imported by both the UI and the evaluation workers.

import type { AnyAgentModule } from '../agent';
import { chemotaxisAgent } from './chemotaxis';
import { leggedAgent } from './legged';
import { oscillatorAgent } from './oscillator';
import { visualAgent } from './visual';
import { relcatAgent } from './relcat';
import { guidedAgent } from './visual/guided';
import { learningAgent } from './learning';
import { orientationAgent } from './minimal/orientation';
import { memoryAgent } from './minimal/memory';
import { attentionAgent } from './minimal/attention';

export const agentModules: Record<string, AnyAgentModule> = {
  [leggedAgent.id]: leggedAgent,
  [visualAgent.id]: visualAgent,
  [relcatAgent.id]: relcatAgent,
  [guidedAgent.id]: guidedAgent,
  [oscillatorAgent.id]: oscillatorAgent,
  [chemotaxisAgent.id]: chemotaxisAgent,
  [learningAgent.id]: learningAgent,
  [orientationAgent.id]: orientationAgent,
  [memoryAgent.id]: memoryAgent,
  [attentionAgent.id]: attentionAgent,
};
