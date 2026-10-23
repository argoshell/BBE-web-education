// A small multi-series line chart on a shared x axis (canvas), with an optional shaded
// baseline band, a vertical marker and a hover crosshair with values.

import { useRef, useState } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, drawYTicks, fmt, linear, niceTicks } from '../plot';
import { useTheme } from '../theme';

export interface Series {
  label: string;
  values: ArrayLike<number>;
  color: string;
  dash?: number[];
  width?: number;
}

interface Props {
  x: ArrayLike<number>;
  series: Series[];
  /** Shaded band from 0 up to these values (e.g. a chance level). */
  band?: { label: string; values: ArrayLike<number> };
  yRange?: [number, number];
  xLabel?: string;
  yLabel?: string;
  marker?: number;
  height?: number;
  onClickX?: (x: number) => void;
}

const PAD = { l: 48, r: 12, t: 10, b: 34 };

export function LineChart({ x, series, band, yRange, xLabel, yLabel, marker, height = 200, onClickX }: Props) {
  const theme = useTheme();
  const [hover, setHover] = useState<{ i: number; px: number; py: number } | null>(null);
  const geom = useRef({ w: 0 });
  const n = x.length;
  let lo = yRange?.[0] ?? Infinity, hi = yRange?.[1] ?? -Infinity;
  if (!yRange) {
    for (const s of series) for (let i = 0; i < s.values.length; i++) { const v = s.values[i]; if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    if (band) for (let i = 0; i < band.values.length; i++) hi = Math.max(hi, band.values[i]);
    lo = Math.min(lo, 0);
    if (!(hi > lo)) hi = lo + 1;
    hi += (hi - lo) * 0.06;
  }

  const { boxRef, canvasRef, width } = useCanvas(height, (ctx, w, h) => {
    geom.current.w = w;
    if (n < 2) return;
    const xs = linear(x[0], x[n - 1], PAD.l, w - PAD.r), ys = linear(lo, hi, h - PAD.b, PAD.t);
    drawYTicks(ctx, ys, PAD.l - 6, niceTicks(lo, hi, 4), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, xs, h - PAD.b, PAD.l, w - PAD.r, niceTicks(x[0], x[n - 1], 8), theme.axis, theme.muted, xLabel);
    if (yLabel) {
      ctx.save();
      ctx.fillStyle = theme.muted;
      ctx.font = '11px system-ui, sans-serif';
      ctx.translate(10, PAD.t);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }
    if (band) {
      ctx.fillStyle = theme.stance;
      ctx.beginPath();
      ctx.moveTo(xs(x[0]), ys(0));
      for (let i = 0; i < n; i++) ctx.lineTo(xs(x[i]), ys(band.values[i]));
      ctx.lineTo(xs(x[n - 1]), ys(0));
      ctx.closePath();
      ctx.fill();
    }
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width ?? 2;
      ctx.setLineDash(s.dash ?? []);
      ctx.beginPath();
      for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, xs(x[i]), ys(s.values[i]));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (marker !== undefined && marker >= x[0] && marker <= x[n - 1]) {
      ctx.strokeStyle = theme.text;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(xs(marker)) + 0.5, PAD.t);
      ctx.lineTo(Math.round(xs(marker)) + 0.5, h - PAD.b);
      ctx.stroke();
    }
    if (hover) {
      ctx.strokeStyle = theme.muted;
      ctx.beginPath();
      ctx.moveTo(Math.round(xs(x[hover.i])) + 0.5, PAD.t);
      ctx.lineTo(Math.round(xs(x[hover.i])) + 0.5, h - PAD.b);
      ctx.stroke();
    }
  }, [x, series, band, lo, hi, marker, hover, theme, xLabel, yLabel]);

  const indexAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const xs = linear(x[0], x[n - 1], PAD.l, geom.current.w - PAD.r);
    const v = xs.invert(e.clientX - r.left);
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x[i] - v) < Math.abs(x[best] - v)) best = i;
    return { i: best, px: e.clientX - r.left, py: e.clientY - r.top };
  };

  return (
    <div>
      <div className="legend" style={{ marginBottom: 4 }}>
        {series.map((s) => (
          <span key={s.label} className="chip">
            <svg width="18" height="8" aria-hidden><line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash?.join(' ')} /></svg>
            {s.label}
          </span>
        ))}
        {band && <span className="chip"><span className="swatch" style={{ background: theme.stance, border: `1px solid ${theme.axis}` }} />{band.label}</span>}
      </div>
      <div ref={boxRef} className="canvas-box">
        <canvas ref={canvasRef} style={{ cursor: onClickX ? 'pointer' : 'crosshair' }}
          onMouseMove={(e) => setHover(indexAt(e))} onMouseLeave={() => setHover(null)}
          onClick={(e) => onClickX?.(x[indexAt(e).i])} />
        {hover && (
          <div className="tooltip num" style={{ left: Math.min(hover.px + 12, width - 190), top: 8 }}>
            <div>{xLabel ?? 'x'} = {fmt(x[hover.i], 2)}</div>
            {series.map((s) => <div key={s.label}>{s.label}: {fmt(s.values[hover.i], 3)}</div>)}
            {band && <div className="muted">{band.label}: {fmt(band.values[hover.i], 3)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
