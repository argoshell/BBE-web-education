import { useSyncExternalStore } from 'react';
import { controllerFor } from './controller';

/** The evolution controller for an agent, re-rendering on every update. */
export function useEvolution(agentId: string) {
  const ctl = controllerFor(agentId);
  const version = useSyncExternalStore(ctl.subscribe, ctl.getVersion);
  return { ctl, version };
}
