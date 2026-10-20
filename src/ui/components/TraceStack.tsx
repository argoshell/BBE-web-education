// Small-multiple time traces: one labelled row per channel, a shared time axis,
// stance shading, a current-time marker, hover crosshair + tooltip, click/drag to seek.

import { useRef, useState } from 'react';
import type { Recording } from '../../sim/core/recording';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, extent, fmt, linear, niceTicks, padExtent, runs } from '../plot';
import { useTheme } from '../theme';

export interface TraceRow {
  key: string;
  label: string;
  color: string;
  range?: [number, number];
  /** Draw as a step function (e.g. foot state). */
  step?: boolean;
}

interface Props {
  rec: Recording;
  rows: TraceRow[];
  idx: number;
  onSeek: (idx: number) => void;
  window: [number, number];
  /** Channel whose value 1 marks stance, shaded across all rows. */
  stanceKey?: string;
  rowHeight?: number;
}

const LEFT = 84, RIGHT = 10, AXIS = 30, GAP = 6;

export function TraceStack({ rec, rows, idx, onSeek, window: [i0, i1], stanceKey, rowHeight = 44 }: Props) {
  const theme = useTheme();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const height = rows.length * (rowHeight + GAP) + AXIS;
  const lastW = useRef(0);

  const { boxRef, canvasRef } = useCanvas(height, (ctx, w) => {
    lastW.current = w;
    const t = rec.t;
    const end = Math.min(i1, t.length - 1);
    const x = linear(t[i0], t[end], LEFT, w - RIGHT);
    const stance = stanceKey ? rec.channels[stanceKey] : undefined;
    const stanceRuns = stance ? runs(end - i0 + 1, (k) => stance[i0 + k] === 1) : [];
    // Decimate to about 2 samples per pixel
    const stride = Math.max(1, Math.floor((end - i0) / ((w - LEFT - RIGHT) * 2)));

    rows.forEach((row, r) => {
      const top = r * (rowHeight + GAP);
      const data = rec.channels[row.key];
      if (!data) return;
      const [lo, hi] = row.range ?? padExtent(extent(data, i0, end + 1));
      const y = linear(lo, hi, top + rowHeight - 2, top + 2);
      // Row surface and stance bands
      ctx.fillStyle = theme.surface2;
      ctx.fillRect(LEFT, top, w - LEFT - RIGHT, rowHeight);
      ctx.fillStyle = theme.stance;
      for (const [a, b] of stanceRuns) ctx.fillRect(x(t[i0 + a]), top, x(t[i0 + b - 1]) - x(t[i0 + a]), rowHeight);
      // Label and range
      ctx.fillStyle = row.color;
      ctx.fillRect(4, top + 6, 8, 8);
      ctx.fillStyle = theme.text2;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(row.label, 16, top + 4);
      ctx.fillStyle = theme.muted;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(fmt(hi, 2), LEFT - 4, top + 2);
      ctx.textBaseline = 'bottom';
      ctx.fillText(fmt(lo, 2), LEFT - 4, top + rowHeight);
      // Trace
      ctx.save();
      ctx.beginPath();
      ctx.rect(LEFT, top, w - LEFT - RIGHT, rowHeight);
      ctx.clip();
      ctx.strokeStyle = row.color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let prev = NaN;
      for (let k = i0; k <= end; k += stride) {
        const px = x(t[k]), py = y(data[k]);
        if (k === i0) ctx.moveTo(px, py);
        else if (row.step) { ctx.lineTo(px, y(prev)); ctx.lineTo(px, py); }
        else ctx.lineTo(px, py);
        prev = data[k];
      }
      ctx.stroke();
      ctx.restore();
    });

    // Current time marker
    if (idx >= i0 && idx <= end) {
      const px = Math.round(x(t[idx])) + 0.5;
      ctx.strokeStyle = theme.text;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height - AXIS);
      ctx.stroke();
    }
    // Hover crosshair
    if (hover && hover.i >= i0 && hover.i <= end) {
      const px = Math.round(x(t[hover.i])) + 0.5;
      ctx.strokeStyle = theme.muted;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height - AXIS);
      ctx.stroke();
    }
    drawXAxis(ctx, x, height - AXIS + 2, LEFT, w - RIGHT, niceTicks(t[i0], t[end], 8), theme.axis, theme.muted, 'time');
  }, [rec, rows, idx, i0, i1, stanceKey, theme, hover, rowHeight]);

  const idxAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const t = rec.t, end = Math.min(i1, t.length - 1);
    const x = linear(t[i0], t[end], LEFT, lastW.current - RIGHT);
    const tv = x.invert(clientX - r.left);
    // Uniform time steps
    const dt = (t[end] - t[i0]) / Math.max(1, end - i0);
    return Math.max(i0, Math.min(end, Math.round(i0 + (tv - t[i0]) / dt)));
  };

  const tip = hover && (
    <div className="tooltip" style={{ left: Math.min(hover.x + 12, lastW.current - 170), top: 4 }}>
      <div className="num">t = {fmt(rec.t[hover.i], 2)}</div>
      {rows.map((r) => (
        <div key={r.key} className="inline num">
          <span className="swatch" style={{ background: r.color }} />
          {r.label}: {fmt(rec.channels[r.key]?.[hover.i] ?? NaN, 4)}
        </div>
      ))}
    </div>
  );

  return (
    <div ref={boxRef} className="canvas-box">
      <canvas
        ref={canvasRef}
        style={{ cursor: 'crosshair' }}
        onMouseMove={(e) => {
          const i = idxAt(e.clientX, e.currentTarget);
          setHover({ i, x: e.clientX - e.currentTarget.getBoundingClientRect().left, y: 0 });
          if (e.buttons & 1) onSeek(i);
        }}
        onMouseLeave={() => setHover(null)}
        onMouseDown={(e) => onSeek(idxAt(e.clientX, e.currentTarget))}
      />
      {tip}
    </div>
  );
}
