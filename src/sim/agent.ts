// The interface every agent/task implements. Everything here must be worker-safe
// (no DOM, no React) and every config must be structured-cloneable, because
// evaluation runs in Web Workers.

import type { CTRNNParams } from './core/ctrnn';
import type { RandomState } from './core/random';
import type { ChannelSpec, Recording } from './core/recording';

export interface Preset<P> {
  name: string;
  description?: string;
  params: () => P;
}

/** Describes the neural part of an agent so generic views (phase portraits) can analyze it. */
export interface CircuitView {
  circuit: CTRNNParams;
  /** Recording channel for neuron i's output, state and external input. */
  outputKey: (i: number) => string;
  stateKey: (i: number) => string;
  inputKey: (i: number) => string;
}

export interface AgentModule<P, E> {
  id: string;
  name: string;
  citation: string;

  defaultParams(): P;
  presets: Preset<P>[];
  simulate(p: P): Recording;
  channels(p: P): ChannelSpec[];
  circuitView(p: P): CircuitView | null;

  // ---- evolution ----
  /** Evolution config derived from the current parameters (controller, size, ranges, run). */
  defaultEvoConfig(p: P): E;
  genomeSize(e: E): number;
  decode(genome: ArrayLike<number>, e: E): P;
  /** Fitness of a genome. Must use only rs for randomness. */
  evaluate(genome: Float64Array, e: E, rs: RandomState): number;
  /** Labels for each genome entry, for parameter-diff views. */
  genomeLabels(e: E): string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAgentModule = AgentModule<any, any>;
