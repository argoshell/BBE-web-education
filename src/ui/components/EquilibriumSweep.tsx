// Equilibria of the whole circuit as a function of a sensed parameter (e.g. leg angle),
// with the actual trajectory overlaid. Where the trajectory leaves an equilibrium branch
// that has disappeared, the circuit is "switched" by the sensory feedback.

import { useMemo, useState } from 'react';
import type { CircuitView, InputSweep } from '../../sim/agent';
import { sweepEquilibria } from '../../sim/analysis/equilibria';
import type { Recording } from '../../sim/core/recording';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, drawYTicks, extent, linear, niceTicks } from '../plot';
import { neuronColor, useTheme } from '../theme';

const PAD = { l: 44, r: 12, t: 10, b: 34 };

interface Props {
  rec: Recording;
  circuitView: CircuitView;
  sweep: InputSweep;
  idx: number;
  window: [number, number];
}

export function EquilibriumSweep({ rec, circuitView, sweep, idx, window: [i0, i1] }: Props) {
  const theme = useTheme();
  const [neuron, setNeuron] = useState(0);
  const n = circuitView.circuit.size;
  const k = Math.min(neuron, n - 1);
  const points = useMemo(() => sweepEquilibria(circuitView.circuit, sweep.inputs, sweep.range, 150), [circuitView.circuit, sweep]);
  const p = rec.channels[sweep.channel], o = rec.channels[circuitView.outputKey(k)];
  const end = Math.min(i1, rec.t.length - 1);
  const xr = useMemo((): [number, number] => {
    const [a, b] = extent(p, i0, end + 1);
    return [Math.min(sweep.range[0], a), Math.max(sweep.range[1], b)];
  }, [p, i0, end, sweep.range]);
  const slot = circuitView.colorSlot ? circuitView.colorSlot(k) : k + 1;
  const color = slot > 0 ? neuronColor(theme, slot) : theme.text2;
  const name = circuitView.name ? circuitView.name(k) : `n${k + 1}`;

  const { boxRef, canvasRef } = useCanvas((w) => Math.max(220, Math.min(w * 0.7, 360)), (ctx, w, h) => {
    const x = linear(xr[0], xr[1], PAD.l, w - PAD.r), y = linear(-0.03, 1.03, h - PAD.b, PAD.t);
    drawYTicks(ctx, y, PAD.l - 4, [0, 0.25, 0.5, 0.75, 1], theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(xr[0], xr[1], 6), theme.axis, theme.muted, sweep.label);
    // Trajectory
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let t = i0; t <= end; t++) (t === i0 ? ctx.moveTo : ctx.lineTo).call(ctx, x(p[t]), y(o[t]));
    ctx.stroke();
    // Equilibria: stable filled, unstable hollow
    for (const pt of points) {
      const px = x(pt.param), py = y(pt.eq.outputs[k]);
      ctx.beginPath();
      ctx.arc(px, py, pt.eq.stable ? 2.2 : 2, 0, Math.PI * 2);
      if (pt.eq.stable) { ctx.fillStyle = theme.text; ctx.fill(); }
      else { ctx.strokeStyle = theme.muted; ctx.lineWidth = 1; ctx.stroke(); }
    }
    // Current state
    if (idx <= end && idx >= i0) {
      ctx.beginPath();
      ctx.arc(x(p[idx]), y(o[idx]), 5, 0, Math.PI * 2);
      ctx.fillStyle = theme.text;
      ctx.fill();
      ctx.strokeStyle = theme.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [points, rec, k, idx, i0, end, theme, xr, color]);

  return (
    <div>
      <div className="inline small" style={{ marginBottom: 6 }}>
        <span className="muted">neuron</span>
        <select value={k} onChange={(e) => setNeuron(Number(e.target.value))}>
          {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{circuitView.name ? circuitView.name(i) : `n${i + 1}`} output</option>)}
        </select>
      </div>
      <div ref={boxRef} className="canvas-box"><canvas ref={canvasRef} /></div>
      <div className="legend" style={{ marginTop: 6 }}>
        <span className="chip"><span className="swatch" style={{ background: theme.text, borderRadius: 5 }} />stable equilibrium</span>
        <span className="chip"><span className="swatch" style={{ border: `1px solid ${theme.muted}`, borderRadius: 5 }} />unstable</span>
        <span className="chip"><span className="swatch" style={{ background: color }} />{name} trajectory</span>
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>
        Each column holds the equilibria of the whole circuit if {sweep.label.replace(/ \(.*\)/, '')} were frozen at that value. The trajectory
        follows a stable branch until sensory feedback makes that branch disappear (a bifurcation), then jumps to another.
      </p>
    </div>
  );
}
