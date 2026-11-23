// Information card for the minimally cognitive visual tasks: what each neuron knows about the stimulus,
// moment by moment, across many trials (Williams & Beer 2010; Beer & Williams 2015). The trial ensemble
// is built in a background worker.

import { useMemo, useState } from 'react';
import type { MinimalController } from '../../../sim/agents/minimal/common';
import { colorSlot } from '../../../sim/agents/minimal/network';
import type { JobArgs } from '../../../sim/jobs';
import { Busy, Stale } from '../../components/Busy';
import { useJob } from '../../hooks/useJob';
import { InfoPanel } from '../../info/InfoPanel';
import { neuronColor, useTheme } from '../../theme';

type EnsembleJob = 'orientation.ensemble' | 'memory.ensemble' | 'attention.ensemble';

interface Props<K extends EnsembleJob> {
  job: K;
  state: JobArgs<K> & MinimalController;
  summary: string;
  description: React.ReactNode;
  defaultPair: [string, string];
  /** Real-time ensembles can follow the trial viewer's time cursor. */
  time?: number;
  onSeekTime?: (t: number) => void;
}

export function MinimalInfoCard<K extends EnsembleJob>({ job, state, summary, description, defaultPair, time, onSeekTime }: Props<K>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const ens = useJob(job, open ? state : null);
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
        {open && <Busy pending={ens.pending} ms={ens.ms} label={ens.value ? 'updating…' : 'computing…'} />}
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Analyze'}</button>
      </div>
      {!open || !ens.value ? <p className="small muted">{description}</p> : (
        <Stale pending={ens.pending}>
          <InfoPanel ensemble={ens.value} colorOf={colorOf} time={time} onSeekTime={onSeekTime} defaultPair={defaultPair} />
        </Stale>
      )}
    </div>
  );
}
