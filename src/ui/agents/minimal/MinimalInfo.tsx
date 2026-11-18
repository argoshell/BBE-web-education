// Information card for the minimally cognitive visual tasks: what each neuron knows about the stimulus,
// moment by moment, across many trials (Williams & Beer 2010; Beer & Williams 2015).

import { useDeferredValue, useMemo, useState } from 'react';
import type { Ensemble } from '../../../sim/analysis/information';
import type { MinimalController } from '../../../sim/agents/minimal/common';
import { colorSlot } from '../../../sim/agents/minimal/network';
import { InfoPanel } from '../../info/InfoPanel';
import { neuronColor, useTheme } from '../../theme';

interface Props<S extends MinimalController> {
  state: S;
  /** Build the ensemble (called only while the card is open). */
  build: (s: S) => Ensemble;
  summary: string;
  description: React.ReactNode;
  defaultPair: [string, string];
  /** Real-time ensembles can follow the trial viewer's time cursor. */
  time?: number;
  onSeekTime?: (t: number) => void;
}

export function MinimalInfoCard<S extends MinimalController>({ state, build, summary, description, defaultPair, time, onSeekTime }: Props<S>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const deferred = useDeferredValue(state);
  const ensemble = useMemo(() => (open ? build(deferred) : null), [open, deferred, build]);
  const colorOf = useMemo(() => (key: string) => {
    if (key === 'relX2') return theme.series[1];
    if (key.startsWith('relX')) return undefined;
    const i = Number(key.slice(1)) - 1;
    return i < state.arch.sensors ? theme.text2 : neuronColor(theme, colorSlot(state.arch, i));
  }, [theme, state.arch]);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Information</h2>
        <span className="muted small">{summary}</span>
        <div className="spacer" />
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Analyze'}</button>
      </div>
      {!open || !ensemble ? <p className="small muted">{description}</p> : (
        <InfoPanel ensemble={ensemble} colorOf={colorOf} time={time} onSeekTime={onSeekTime} defaultPair={defaultPair} />
      )}
    </div>
  );
}
