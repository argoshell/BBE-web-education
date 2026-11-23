// Information-theoretic analysis card for the visually guided tasks.

import { useMemo, useState } from 'react';
import { ensembleGrid } from '../../../sim/agents/visual/guidedEnsemble';
import { guidedColorSlot, taskInfo, type GuidedState } from '../../../sim/agents/visual/guided';
import { InfoPanel } from '../../info/InfoPanel';
import { neuronColor, useTheme } from '../../theme';
import { useJob } from '../../hooks/useJob';
import { Busy, Stale } from '../../components/Busy';

export function GuidedInfoCard({ state, time, onSeekTime }: { state: GuidedState; time: number; onSeekTime: (t: number) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [dense, setDense] = useState(false);
  // Built in a background worker; only the controller, task, grid and step size matter (not the selected trial)
  const { circuit, sensorWeights, task, grid, dt, trial, maxDistance } = state;
  const ens = useJob('guided.ensemble', useMemo(
    () => (open ? { state: { circuit, sensorWeights, task, grid, dt, trial, maxDistance }, grid: ensembleGrid(grid, dense) } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, dense, circuit, sensorWeights, task, grid, dt],
  ));
  const ensemble = open ? ens.value ?? null : null;
  const colorOf = useMemo(() => (key: string) => (key === 'relX' ? undefined : neuronColor(theme, guidedColorSlot(Number(key.slice(1)) - 1))), [theme]);
  const info = taskInfo[state.task];
  const what = state.task === 'size' ? 'circle' : 'gap';

  return (
    <div className="card">
      <div className="card-head">
        <h2>Information</h2>
        <span className="muted small">what each neuron knows about the {what}, moment by moment, across every trial</span>
        <div className="spacer" />
        {open && (
          <label className="chip"><input type="checkbox" checked={dense} onChange={(e) => setDense(e.target.checked)} />dense grid (every integer offset and {what} width)</label>
        )}
        {open && <Busy pending={ens.pending} ms={ens.ms} label={ensemble ? 'updating…' : 'computing…'} />}
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Analyze'}</button>
      </div>
      {!open || !ensemble ? (
        <p className="small muted">
          Runs every trial of the fitness grid and measures the mutual information between what was presented (the required response,
          {' '}{info.small} or {info.large}; the {what} width; its horizontal offset) and each neuron&apos;s output at every moment, following
          Williams &amp; Beer (2010) and Beer &amp; Williams (2015). Information about the offset is available from the start; watch when
          information about the response appears, and in which neurons, as the {what} falls.
        </p>
      ) : (
        <Stale pending={ens.pending}>
          <InfoPanel key={state.task} ensemble={ensemble} colorOf={colorOf} time={time} onSeekTime={onSeekTime} defaultPair={['relX', 'o8']} />
        </Stale>
      )}
    </div>
  );
}
