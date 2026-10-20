// State shared by every agent explorer page: current parameters (synced to the URL),
// the simulated recording, playback, phase-portrait axes, the selected evolved
// individual and up to three pinned individuals for comparison.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgentModule } from '../../sim/agent';
import type { Recording } from '../../sim/core/recording';
import { useEvolution } from '../evolution/EvolutionPanel';
import { parseHash, writeHash } from '../urlState';

export interface LoadedIndividual {
  id: number;
  born: number;
  perf: number;
  modified: boolean;
}

export interface Pin<P> {
  id: number;
  label: string;
  params: P;
  rec: Recording;
}

export interface ExplorerOptions<P> {
  /** Restore state from the URL (merge into defaults); return null if invalid. */
  fromUrl: (s: unknown) => P | null;
  defaultAxes: (p: P) => [string, string];
}

export function useExplorer<P, E>(agent: AgentModule<P, E>, opts: ExplorerOptions<P>) {
  const [state, setStateRaw] = useState<P>(() => {
    const { page, state } = parseHash();
    return (page === agent.id && state ? opts.fromUrl(state) : null) ?? agent.defaultParams();
  });
  const [loaded, setLoaded] = useState<LoadedIndividual | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  const [win, setWin] = useState<[number, number]>([0, Infinity]);
  const [axes, setAxes] = useState<[string, string]>(() => opts.defaultAxes(state));
  const [evoConfig, setEvoConfig] = useState<E>(() => agent.defaultEvoConfig(state));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pins, setPins] = useState<Pin<P>[]>([]);
  const { ctl } = useEvolution(agent.id);

  /** Edit the parameters (marks a loaded individual as modified). */
  const setState = useCallback((s: P) => {
    setStateRaw(s);
    setLoaded((l) => (l ? { ...l, modified: true } : l));
  }, []);

  /** Replace the parameters with a fresh configuration (preset, reset). */
  const resetTo = useCallback((s: P) => {
    setStateRaw(s);
    setLoaded(null);
    setSelectedId(null);
  }, []);

  useEffect(() => writeHash(agent.id, state), [agent.id, state]);

  const rec = useMemo(() => agent.simulate(state), [agent, state]);
  const channels = useMemo(() => agent.channels(state), [agent, state]);
  const circuitView = useMemo(() => agent.circuitView(state), [agent, state]);
  const n = rec.t.length;
  const window: [number, number] = [Math.max(0, Math.min(win[0], n - 2)), Math.min(win[1], n - 1)];
  const cur = Math.min(idx, n - 1);

  // Keep phase axes valid when the channels change
  useEffect(() => {
    const keys = new Set(channels.map((c) => c.key));
    if (!keys.has(axes[0]) || !keys.has(axes[1])) setAxes(opts.defaultAxes(state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  const decodeFromRun = useCallback((id: number): { params: P; born: number; perf: number } | null => {
    const run = ctl.run;
    const a = run?.archive.get(id);
    if (!run || !a) return null;
    return { params: agent.decode(a.genome, run.evoConfig as E), born: a.born, perf: a.perf };
  }, [ctl, agent]);

  const selectIndividual = useCallback((id: number) => {
    const d = decodeFromRun(id);
    if (!d) return;
    setSelectedId(id);
    setStateRaw(d.params);
    setLoaded({ id, born: d.born, perf: d.perf, modified: false });
  }, [decodeFromRun]);

  const pin = useCallback((id: number) => {
    const d = decodeFromRun(id);
    if (!d) return;
    setPins((ps) => (ps.some((p) => p.id === id) ? ps
      : [...ps, { id, label: `#${id} (gen ${d.born})`, params: d.params, rec: agent.simulate(d.params) }].slice(-3)));
  }, [decodeFromRun, agent]);

  const unpin = useCallback((id: number) => setPins((ps) => ps.filter((p) => p.id !== id)), []);

  return {
    state, setState, resetTo, loaded, rec, channels, circuitView, window, cur,
    idx, setIdx, playing, setPlaying, speed, setSpeed, setWin,
    axes, setAxes, evoConfig, setEvoConfig, selectedId, pins, setPins, selectIndividual, pin, unpin, ctl,
  };
}
