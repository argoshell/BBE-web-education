// Pieces shared by the minimally cognitive task pages.

import { useMemo, useState } from 'react';
import type { CircuitView } from '../../../sim/agent';
import type { ChannelSpec, Recording } from '../../../sim/core/recording';
import type { MinimalController } from '../../../sim/agents/minimal/common';
import { colorSlot, neuronName } from '../../../sim/agents/minimal/network';
import { CheckField } from '../../components/controls';
import { PhasePortrait, type PhaseOverlay } from '../../components/PhasePortrait';
import { TraceStack, type TraceRow } from '../../components/TraceStack';
import { neuronColor, useTheme } from '../../theme';

export function AssumptionList({ items, children }: { items: string[]; children?: React.ReactNode }) {
  return (
    <details className="small" style={{ marginBottom: 8 }}>
      <summary>What the papers leave open, and how this version fills it</summary>
      <ul>{items.map((a) => <li key={a}>{a}</li>)}</ul>
      {children}
    </details>
  );
}

interface CircuitCardsProps {
  state: MinimalController;
  rec: Recording;
  cur: number;
  window: [number, number];
  onSeek: (i: number) => void;
  channels: ChannelSpec[];
  circuitView: CircuitView | null;
  axes: [string, string];
  onAxes: (x: string, y: string) => void;
  overlays: PhaseOverlay[];
  /** Body rows below the neurons, e.g. agent − object distance. */
  bodyRows: TraceRow[];
}

/** Neural traces (interneurons and motors, optionally the ray neurons) beside the phase portrait. */
export function CircuitCards({ state, rec, cur, window, onSeek, channels, circuitView, axes, onAxes, overlays, bodyRows }: CircuitCardsProps) {
  const theme = useTheme();
  const [showSensors, setShowSensors] = useState(false);
  const rows: TraceRow[] = useMemo(() => {
    const a = state.arch, n = state.circuit.size, out: TraceRow[] = [];
    for (let i = 0; i < n; i++) {
      if (i < a.sensors && !showSensors) continue;
      out.push({ key: `o${i + 1}`, label: neuronName(a, i), color: i < a.sensors ? theme.text2 : neuronColor(theme, colorSlot(a, i)), range: [0, 1] });
    }
    return [...out, ...bodyRows];
  }, [state.arch, state.circuit.size, showSensors, theme, bodyRows]);
  return (
    <div className="row-2">
      <div className="card">
        <div className="card-head">
          <h2>Neural traces</h2>
          <div className="spacer" />
          <CheckField label="ray neurons" value={showSensors} onChange={setShowSensors} />
        </div>
        <TraceStack rec={rec} rows={rows} idx={cur} onSeek={onSeek} window={window} rowHeight={rows.length > 12 ? 20 : 30} />
      </div>
      <div className="card">
        <div className="card-head"><h2>Phase portrait</h2></div>
        <PhasePortrait rec={rec} channels={channels} circuitView={circuitView} idx={cur} window={window}
          xKey={axes[0]} yKey={axes[1]} onAxes={onAxes} overlays={overlays} />
      </div>
    </div>
  );
}
