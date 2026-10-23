// Information-theoretic analysis card for the visual categorizer.

import { useDeferredValue, useMemo, useState } from 'react';
import { visualEnsemble } from '../../../sim/agents/visual/ensemble';
import type { VisualState } from '../../../sim/agents/visual';
import { InfoPanel } from '../../info/InfoPanel';
import { neuronColor, useTheme } from '../../theme';

export function VisualInfoCard({ state, time, onSeekTime }: { state: VisualState; time: number; onSeekTime: (t: number) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [perShape, setPerShape] = useState(50);
  const deferred = useDeferredValue(state);
  const ensemble = useMemo(() => (open ? visualEnsemble(deferred, { perShape }) : null), [open, deferred, perShape]);
  const colorOf = useMemo(() => (key: string) => {
    if (key === 'relX') return undefined;
    const i = Number(key.slice(1)) - 1;
    if (i < 7) return theme.text2;
    return neuronColor(theme, i - 6);
  }, [theme]);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Information</h2>
        <span className="muted small">what each neuron knows about the object, moment by moment, across many trials</span>
        <div className="spacer" />
        {open && (
          <label className="chip">trials per shape
            <select value={perShape} onChange={(e) => setPerShape(Number(e.target.value))}>{[20, 50, 100, 200].map((v) => <option key={v} value={v}>{v}</option>)}</select>
          </label>
        )}
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Analyze'}</button>
      </div>
      {!open ? (
        <p className="small muted">
          Runs {2 * perShape} trials (circles and lines from evenly spaced starting offsets) and measures the mutual information between
          what was presented (shape, side, offset) and each neuron&apos;s output at every moment, following Williams &amp; Beer (2010) and
          Beer &amp; Williams (2015). Watch information about <i>side</i> appear early and information about <i>shape</i> build up as the agent scans.
        </p>
      ) : ensemble && (
        <InfoPanel ensemble={ensemble} colorOf={colorOf} time={time} onSeekTime={onSeekTime} defaultPair={['relX', 'o13']} />
      )}
    </div>
  );
}
