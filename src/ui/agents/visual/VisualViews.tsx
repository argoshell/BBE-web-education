// Views for the visual categorization agent: the arena and an overview of all trials.

import { useMemo, useRef, useState } from 'react';
import { BodySize, MaxRayLength, NumRays, VisualAngle } from '../../../sim/agents/visual/body';
import type { TrialResult } from '../../../sim/agents/visual';
import type { Recording } from '../../../sim/core/recording';
import { useCanvas } from '../../hooks/useCanvas';
import { drawXAxis, drawYTicks, fmt, linear, niceTicks } from '../../plot';
import { useTheme, withAlpha } from '../../theme';

const X_RANGE: [number, number] = [-110, 110];
const Y_RANGE: [number, number] = [-22, 292];

/** Top-down arena: agent, its seven rays, and the falling object at the current time. */
export function VisualArena({ rec, idx, shape, size }: { rec: Recording; idx: number; shape: 'circle' | 'line'; size: number }) {
  const theme = useTheme();
  const { boxRef, canvasRef } = useCanvas((w) => Math.min(380, Math.round(w * 0.55)), (ctx, w, h) => {
    const ch = rec.channels;
    const i = Math.min(idx, rec.t.length - 1);
    // Equal scale on both axes, centered horizontally
    const s = Math.min(w / (X_RANGE[1] - X_RANGE[0]), h / (Y_RANGE[1] - Y_RANGE[0]));
    const X = (x: number) => w / 2 + x * s;
    const Y = (y: number) => h - (y - Y_RANGE[0]) * s;
    ctx.fillStyle = theme.surface2;
    ctx.fillRect(0, 0, w, h);
    // Ground and tick marks
    ctx.strokeStyle = theme.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(Y(-BodySize / 2)) + 0.5);
    ctx.lineTo(w, Math.round(Y(-BodySize / 2)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let gx = -100; gx <= 100; gx += 50) ctx.fillText(String(gx), X(gx), Y(-BodySize / 2) + 3);

    const ax = ch.agentX[i], ox = ch.objectX[i], oy = ch.objectY[i];
    // Object path
    ctx.strokeStyle = withAlpha(theme.muted, 0.35);
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(X(ox), Y(275));
    ctx.lineTo(X(ox), Y(BodySize / 2));
    ctx.stroke();
    ctx.setLineDash([]);
    // Agent trail
    ctx.strokeStyle = withAlpha(theme.text2, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k <= i; k++) {
      // Plot the agent's x against the object's height to show the approach
      const px = X(ch.agentX[k]), py = Y(ch.objectY[k]);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // Rays
    for (let r = 0; r < NumRays; r++) {
      const theta = -VisualAngle / 2 + (r * VisualAngle) / (NumRays - 1);
      const len = ch[`ray${r + 1}`][i];
      const sx = ax + (BodySize / 2) * Math.sin(theta), sy = (BodySize / 2) * Math.cos(theta);
      const hit = len < MaxRayLength;
      ctx.strokeStyle = hit ? theme.text : withAlpha(theme.muted, 0.45);
      ctx.lineWidth = hit ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(X(sx), Y(sy));
      ctx.lineTo(X(sx + len * Math.sin(theta)), Y(sy + len * Math.cos(theta)));
      ctx.stroke();
    }
    // Object
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.text;
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(X(ox), Y(oy), (size / 2) * s, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(theme.text, 0.15);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(X(ox - size / 2), Y(oy));
      ctx.lineTo(X(ox + size / 2), Y(oy));
      ctx.stroke();
    }
    // Agent body
    ctx.beginPath();
    ctx.arc(X(ax), Y(0), (BodySize / 2) * s, 0, Math.PI * 2);
    ctx.fillStyle = theme.text2;
    ctx.fill();
    // Readout
    ctx.fillStyle = theme.text2;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`agent x = ${fmt(ax, 1)}   object height = ${fmt(oy, 0)}   Δx = ${fmt(ax - ox, 1)}`, 8, 8);
  }, [rec, idx, shape, size, theme]);
  return <div ref={boxRef} className="canvas-box" style={{ borderRadius: 6, overflow: 'hidden' }}><canvas ref={canvasRef} /></div>;
}

const PAD = { l: 46, r: 12, t: 10, b: 34 };

/** One panel of trials (a single shape) on shared axes. */
function TrialPanel({ results, color, selected, onSelect, maxDistance, xr }: {
  results: TrialResult[];
  color: string;
  selected: { shape: string; offset: number };
  onSelect: (shape: 'circle' | 'line', offset: number) => void;
  maxDistance: number;
  xr: [number, number];
}) {
  const theme = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const geom = useRef({ w: 0, h: 0 });

  const { boxRef, canvasRef, width } = useCanvas(300, (ctx, w, h) => {
    geom.current = { w, h };
    const x = linear(xr[0], xr[1], PAD.l, w - PAD.r), y = linear(0, 290, h - PAD.b, PAD.t);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(0, 290, 5), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(xr[0], xr[1], 6), theme.axis, theme.muted, 'agent x − object x');
    // Catch zone (within a body width) and the scoring limits
    ctx.fillStyle = withAlpha(theme.series[0], 0.08);
    ctx.fillRect(x(-BodySize / 2), PAD.t, x(BodySize / 2) - x(-BodySize / 2), h - PAD.t - PAD.b);
    ctx.strokeStyle = theme.axis;
    for (const d of [-maxDistance, maxDistance]) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x(d)) + 0.5, PAD.t);
      ctx.lineTo(Math.round(x(d)) + 0.5, h - PAD.b);
      ctx.stroke();
    }
    results.forEach((r, k) => {
      const sel = r.shape === selected.shape && Math.abs(r.offset - selected.offset) < 1e-9;
      ctx.strokeStyle = color;
      ctx.globalAlpha = hover === null || hover === k || sel ? 1 : 0.35;
      ctx.lineWidth = sel || hover === k ? 2.5 : 1.25;
      ctx.beginPath();
      for (let s = 0; s < r.relX.length; s++) (s ? ctx.lineTo : ctx.moveTo).call(ctx, x(r.relX[s]), y(r.objY[s]));
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }, [results, selected, hover, theme, xr, maxDistance, color]);

  const nearest = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const x = linear(xr[0], xr[1], PAD.l, geom.current.w - PAD.r), y = linear(0, 290, geom.current.h - PAD.b, PAD.t);
    let best = -1, bd = 120;
    results.forEach((r, k) => {
      for (let s = 0; s < r.relX.length; s += 2) {
        const d = (x(r.relX[s]) - mx) ** 2 + (y(r.objY[s]) - my) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
    });
    return best;
  };
  const hr = hover !== null ? results[hover] : null;
  return (
    <div ref={boxRef} className="canvas-box">
      <canvas ref={canvasRef} style={{ cursor: 'pointer' }}
        onMouseMove={(e) => { const k = nearest(e); setHover(k >= 0 ? k : null); }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => { const k = nearest(e); if (k >= 0) onSelect(results[k].shape, results[k].offset); }} />
      {hr && (
        <div className="tooltip num" style={{ left: Math.min(60, width - 200), top: 10 }}>
          {hr.shape} from offset {fmt(hr.offset, 1)}<br />final Δx {fmt(hr.finalDx, 1)} · score {fmt(hr.score, 3)}
        </div>
      )}
    </div>
  );
}

/**
 * All trials, split into catch trials (circles) and avoid trials (lines): horizontal offset
 * (agent − object) against object height, on shared axes. Catching ends near 0; avoiding ends
 * far from it. Click a trial to load it.
 */
export function TrialsOverview({ results, selected, onSelect, maxDistance }: {
  results: TrialResult[];
  selected: { shape: string; offset: number };
  onSelect: (shape: 'circle' | 'line', offset: number) => void;
  maxDistance: number;
}) {
  const theme = useTheme();
  const xr = useMemo((): [number, number] => {
    let m = 60;
    for (const r of results) for (const v of r.relX) m = Math.max(m, Math.abs(v));
    return [-m * 1.05, m * 1.05];
  }, [results]);
  const circles = useMemo(() => results.filter((r) => r.shape === 'circle'), [results]);
  const lines = useMemo(() => results.filter((r) => r.shape === 'line'), [results]);
  const mean = (a: TrialResult[]) => a.reduce((s, r) => s + r.score, 0) / Math.max(1, a.length);
  return (
    <div>
      <div className="stats" style={{ marginBottom: 6 }}>
        <div className="stat"><span className="v num">{fmt(mean(results), 3)}</span><span className="l">fitness (mean score)</span></div>
        <div className="stat"><span className="v num">{fmt(mean(circles), 3)}</span><span className="l">circles caught</span></div>
        <div className="stat"><span className="v num">{fmt(mean(lines), 3)}</span><span className="l">lines avoided</span></div>
      </div>
      <p className="muted small" style={{ marginBottom: 6 }}>Shaded: within a body width of the object · vertical rules: ±{maxDistance} scoring limit · click a trial to load it.</p>
      <div className="split-2">
        <div>
          <h3 className="inline" style={{ marginBottom: 4 }}><span className="swatch" style={{ background: theme.series[0] }} />Circle trials: catch ({circles.length}, score {fmt(mean(circles), 3)})</h3>
          <TrialPanel results={circles} color={theme.series[0]} selected={selected} onSelect={onSelect} maxDistance={maxDistance} xr={xr} />
        </div>
        <div>
          <h3 className="inline" style={{ marginBottom: 4 }}><span className="swatch" style={{ background: theme.series[1] }} />Line trials: avoid ({lines.length}, score {fmt(mean(lines), 3)})</h3>
          <TrialPanel results={lines} color={theme.series[1]} selected={selected} onSelect={onSelect} maxDistance={maxDistance} xr={xr} />
        </div>
      </div>
    </div>
  );
}
