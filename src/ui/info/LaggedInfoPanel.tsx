// Lagged mutual information within one run: how much each channel tells about a target
// variable at a time offset. A peak at a positive lag means the channel anticipates the
// target (its present predicts the target's future); a negative lag means it echoes it.

import { useMemo, useRef, useState } from 'react';
import { laggedMI } from '../../sim/analysis/information';
import type { Recording } from '../../sim/core/recording';
import { LineChart } from '../components/LineChart';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, fmt, linear, niceTicks } from '../plot';
import { useTheme, type Theme } from '../theme';

function ramp(theme: Theme, t: number): string {
  const surfaceIsDark = parseInt(theme.surface.replace('#', '').slice(0, 2), 16) < 128;
  const lo = surfaceIsDark ? [26, 26, 25] : [252, 252, 251], hi = surfaceIsDark ? [158, 197, 244] : [13, 54, 107];
  const c = lo.map((v, k) => Math.round(v + (hi[k] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export interface LagChannel {
  key: string;
  label: string;
  color?: string;
}

interface Props {
  rec: Recording;
  channels: LagChannel[];
  targets: LagChannel[];
  /** Samples before this time are ignored (transient). */
  fromTime: number;
}

const LEFT = 92, RIGHT = 12, AXIS = 30, ROW = 18;

export function LaggedInfoPanel({ rec, channels, targets, fromTime }: Props) {
  const theme = useTheme();
  const [target, setTarget] = useState(targets[0].key);
  const [maxLag, setMaxLag] = useState(20);
  const [bins, setBins] = useState(8);
  const [sel, setSel] = useState(channels[0]?.key);
  const [hover, setHover] = useState<{ r: number; c: number; px: number; py: number } | null>(null);
  const geom = useRef({ w: 0 });
  const dt = rec.t.length > 1 ? rec.t[1] - rec.t[0] : 1;
  const from = Math.max(0, Math.round(fromTime / dt));

  const { lagTimes, rows, hT } = useMemo(() => {
    const steps = Math.max(1, Math.round(maxLag / dt));
    const stride = Math.max(1, Math.round((2 * steps) / 80));
    const lags: number[] = [];
    for (let l = -steps; l <= steps; l += stride) lags.push(l);
    const y = rec.channels[target];
    const rows = channels.map((c) => laggedMI(rec.channels[c.key], y, lags, bins, from));
    // Entropy of the (binned) target bounds the information
    const self = laggedMI(y, y, [0], bins, from)[0];
    return { lagTimes: Float64Array.from(lags, (l) => l * dt), rows, hT: self };
  }, [rec, channels, target, maxLag, bins, from, dt]);

  const H = channels.length * ROW + AXIS;
  const { boxRef, canvasRef, width } = useCanvas(H, (ctx, w) => {
    geom.current.w = w;
    const cols = lagTimes.length, cw = (w - LEFT - RIGHT) / cols;
    rows.forEach((row, r) => {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = ramp(theme, hT > 0 ? row[c] / hT : 0);
        ctx.fillRect(LEFT + c * cw, r * ROW, cw + 0.6, ROW - 1);
      }
      // Mark the peak
      let best = 0;
      for (let c = 1; c < cols; c++) if (row[c] > row[best]) best = c;
      ctx.fillStyle = theme.series[1];
      ctx.fillRect(LEFT + best * cw + cw / 2 - 1.5, r * ROW + 3, 3, ROW - 7);
      const ch = channels[r];
      ctx.fillStyle = ch.color ?? theme.text2;
      ctx.fillRect(4, r * ROW + 5, 8, 8);
      ctx.fillStyle = ch.key === sel ? theme.text : theme.text2;
      ctx.font = `${ch.key === sel ? '600 ' : ''}11px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch.label, 16, r * ROW + ROW / 2);
    });
    const x = linear(lagTimes[0], lagTimes[cols - 1], LEFT, w - RIGHT);
    ctx.strokeStyle = theme.axis;
    ctx.beginPath();
    ctx.moveTo(Math.round(x(0)) + 0.5, 0);
    ctx.lineTo(Math.round(x(0)) + 0.5, H - AXIS);
    ctx.stroke();
    drawXAxis(ctx, x, H - AXIS + 2, LEFT, w - RIGHT, niceTicks(lagTimes[0], lagTimes[cols - 1], 8), theme.axis, theme.muted, 'lag (time units; + = channel leads target)');
  }, [rows, lagTimes, hT, theme, channels, sel]);

  const cellAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rct = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rct.left, py = e.clientY - rct.top;
    const r = Math.floor(py / ROW), c = Math.floor(((px - LEFT) / (geom.current.w - LEFT - RIGHT)) * lagTimes.length);
    return r >= 0 && r < channels.length && c >= 0 && c < lagTimes.length ? { r, c, px, py } : null;
  };
  const si = Math.max(0, channels.findIndex((c) => c.key === sel));
  const peak = (row: Float64Array) => { let b = 0; for (let c = 1; c < row.length; c++) if (row[c] > row[b]) b = c; return b; };
  const targetLabel = targets.find((t) => t.key === target)?.label ?? target;

  return (
    <div>
      <div className="inline small" style={{ marginBottom: 8 }}>
        <span className="muted">information about</span>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>{targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        <span className="muted">lags ±</span>
        <select value={maxLag} onChange={(e) => setMaxLag(Number(e.target.value))}>{[5, 10, 20, 40, 80].map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <span className="muted">bins</span>
        <select value={bins} onChange={(e) => setBins(Number(e.target.value))}>{[2, 4, 8, 16].map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <span className="muted">equal-count bins · samples after t = {fmt(fromTime, 0)} · H(target) = {fmt(hT, 2)} bits</span>
      </div>
      <div className="legend" style={{ marginBottom: 4 }}>
        <span className="chip"><span className="swatch" style={{ width: 40, background: `linear-gradient(90deg, ${ramp(theme, 0)}, ${ramp(theme, 1)})`, border: `1px solid ${theme.axis}` }} />I(channel(t); target(t + lag)) from 0 to H(target)</span>
        <span className="chip"><span className="swatch" style={{ background: theme.series[1] }} />peak lag</span>
        <span className="muted small">click a row for detail</span>
      </div>
      <div ref={boxRef} className="canvas-box">
        <canvas ref={canvasRef} style={{ cursor: 'pointer' }}
          onMouseMove={(e) => setHover(cellAt(e))} onMouseLeave={() => setHover(null)}
          onClick={(e) => { const c = cellAt(e); if (c) setSel(channels[c.r].key); }} />
        {hover && (
          <div className="tooltip num" style={{ left: Math.min(hover.px + 12, width - 240), top: hover.py + 12 }}>
            {channels[hover.r].label} → {targetLabel}, lag {fmt(lagTimes[hover.c], 2)}<br />
            {fmt(rows[hover.r][hover.c], 3)} bits · peak {fmt(rows[hover.r][peak(rows[hover.r])], 3)} at lag {fmt(lagTimes[peak(rows[hover.r])], 2)}
          </div>
        )}
      </div>
      {channels[si] && (
        <div style={{ marginTop: 10 }}>
          <LineChart x={lagTimes} xLabel="lag" yLabel="bits" marker={0} height={170} yRange={[0, Math.max(hT, 0.05) * 1.05]}
            series={[{ label: `${channels[si].label} about ${targetLabel}`, values: rows[si], color: channels[si].color ?? theme.text }]} />
        </div>
      )}
      <p className="small muted" style={{ marginTop: 6 }}>
        Pooled over time within one run (the run is treated as samples from its attractor), with equal-count bins.
        On a periodic attractor everything is eventually predictable from everything, so look at where the peaks are and how sharp they are.
      </p>
    </div>
  );
}

/** Collapsible card that computes the lagged-information view only when opened. */
export function LaggedInfoCard(props: Props & { description: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Information</h2>
        <span className="muted small">which neurons carry information about the body or each other, and with what lead or lag</span>
        <div className="spacer" />
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Analyze'}</button>
      </div>
      {open ? <LaggedInfoPanel {...props} /> : <p className="small muted">{props.description}</p>}
    </div>
  );
}
