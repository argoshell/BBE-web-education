// Views for the klinotaxis worm: the arena (concentration field + trajectory) and an overview
// of every evaluation run.

import { useMemo, useRef, useState } from 'react';
import { MaxDist, type TrialResult } from '../../../sim/agents/chemotaxis';
import type { Recording } from '../../../sim/core/recording';
import { useCanvas } from '../../hooks/useCanvas';
import { fmt } from '../../plot';
import { useTheme, withAlpha, type Theme } from '../../theme';

interface View { cx: number; cy: number; half: number }

/** Square view that contains the peak, the start and the given points. */
function fitView(xs: ArrayLike<number>[], ys: ArrayLike<number>[]): View {
  let m = MaxDist + 0.6;
  for (let k = 0; k < xs.length; k++)
    for (let i = 0; i < xs[k].length; i++) m = Math.max(m, Math.abs(xs[k][i]) + 0.3, Math.abs(ys[k][i]) + 0.3);
  return { cx: 0, cy: 0, half: Math.min(m, 40) };
}

/**
 * Draw the cone-shaped concentration field (sequential ramp: page surface far from the peak to
 * the accent color at the peak) with iso-concentration rings every 1 cm.
 */
function drawField(ctx: CanvasRenderingContext2D, theme: Theme, w: number, h: number, X: (x: number) => number, Y: (y: number) => number, s: number, view: View) {
  ctx.fillStyle = theme.surface2;
  ctx.fillRect(0, 0, w, h);
  // Concentration is linear in distance, so a linear radial gradient is exact up to the color ramp
  const R = MaxDist * 1.6;
  const g = ctx.createRadialGradient(X(0), Y(0), 0, X(0), Y(0), R * s);
  g.addColorStop(0, withAlpha(theme.accent, 0.55));
  g.addColorStop(0.5, withAlpha(theme.accent, 0.22));
  g.addColorStop(1, withAlpha(theme.accent, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = withAlpha(theme.accent, 0.25);
  ctx.lineWidth = 1;
  const maxR = Math.hypot(Math.abs(view.cx) + view.half, Math.abs(view.cy) + view.half);
  const step = view.half > 2 ? 1 : 0.1;
  for (let r = step; r <= maxR; r += step) {
    ctx.beginPath();
    ctx.arc(X(0), Y(0), r * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Peak
  ctx.strokeStyle = theme.text2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(X(0) - 5, Y(0)); ctx.lineTo(X(0) + 5, Y(0));
  ctx.moveTo(X(0), Y(0) - 5); ctx.lineTo(X(0), Y(0) + 5);
  ctx.stroke();
  // Start
  ctx.beginPath();
  ctx.arc(X(-MaxDist), Y(0), 4, 0, Math.PI * 2);
  ctx.stroke();
}

function path(ctx: CanvasRenderingContext2D, xs: ArrayLike<number>, ys: ArrayLike<number>, X: (x: number) => number, Y: (y: number) => number, from = 0, to = xs.length - 1) {
  ctx.beginPath();
  for (let k = from; k <= to; k++) (k === from ? ctx.moveTo : ctx.lineTo).call(ctx, X(xs[k]), Y(ys[k]));
  ctx.stroke();
}

export type ArenaZoom = 'dish' | 'follow';

/** The worm's path in the gradient up to the current time. */
export function ChemoArena({ rec, idx, zoom }: { rec: Recording; idx: number; zoom: ArenaZoom }) {
  const theme = useTheme();
  const ch = rec.channels;
  const dish = useMemo(() => fitView([ch.x], [ch.y]), [ch]);
  const { boxRef, canvasRef } = useCanvas((w) => Math.min(460, Math.round(w * 0.62)), (ctx, w, h) => {
    const i = Math.min(idx, rec.t.length - 1);
    const view: View = zoom === 'follow' ? { cx: ch.x[i], cy: ch.y[i], half: 0.35 } : dish;
    const s = Math.min(w, h) / (2 * view.half);
    const X = (x: number) => w / 2 + (x - view.cx) * s;
    const Y = (y: number) => h / 2 - (y - view.cy) * s;
    drawField(ctx, theme, w, h, X, Y, s, view);
    // Full path faint, travelled part solid; the evaluated part is drawn thicker
    ctx.lineJoin = 'round';
    ctx.strokeStyle = withAlpha(theme.text2, 0.25);
    ctx.lineWidth = 1;
    path(ctx, ch.x, ch.y, X, Y);
    let e0 = ch.eval.findIndex((v) => v === 1);
    if (e0 < 0) e0 = ch.x.length;
    ctx.strokeStyle = theme.muted;
    ctx.lineWidth = 1.25;
    path(ctx, ch.x, ch.y, X, Y, 0, Math.min(i, e0));
    if (i > e0) {
      ctx.strokeStyle = theme.text2;
      ctx.lineWidth = 2;
      path(ctx, ch.x, ch.y, X, Y, e0, i);
    }
    // Worm head and heading
    const px = X(ch.x[i]), py = Y(ch.y[i]), hd = ch.heading[i];
    const len = zoom === 'follow' ? 26 : 14;
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + len * Math.cos(hd), py - len * Math.sin(hd));
    ctx.stroke();
    ctx.fillStyle = theme.text;
    ctx.strokeStyle = theme.surface;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Scale bar
    const bar = view.half > 2 ? 1 : 0.1;
    ctx.strokeStyle = theme.text2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w - 12 - bar * s, h - 12); ctx.lineTo(w - 12, h - 12);
    ctx.stroke();
    ctx.fillStyle = theme.text2;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(bar === 1 ? '1 cm' : '1 mm', w - 12, h - 16);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`t = ${fmt(rec.t[i], 1)} s   distance to peak = ${fmt(ch.dist[i], 3)} cm   ${ch.eval[i] ? 'scored' : 'transient'}`, 8, 8);
  }, [rec, idx, zoom, theme, dish]);
  return (
    <div>
      <div ref={boxRef} className="canvas-box" style={{ borderRadius: 6, overflow: 'hidden' }}><canvas ref={canvasRef} /></div>
      <div className="legend" style={{ marginTop: 4 }}>
        <span className="chip"><span className="swatch" style={{ background: theme.accent }} />attractant (darker = higher; rings every {zoom === 'follow' ? '1 mm' : '1 cm'})</span>
        <span className="chip">+ peak · ○ start</span>
        <span className="chip"><span className="swatch" style={{ background: theme.muted }} />transient</span>
        <span className="chip"><span className="swatch" style={{ background: theme.text2 }} />scored part</span>
        <span className="chip"><span className="swatch" style={{ background: theme.text }} />head and heading</span>
      </div>
    </div>
  );
}

/** Every run of the evaluation (headings × steepness × repeats). Click a run to load its heading. */
export function TrialsOverview({ results, selected, onSelect }: {
  results: TrialResult[];
  selected: { orient: number; gradSteep: number };
  onSelect: (r: TrialResult) => void;
}) {
  const theme = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const geom = useRef<{ X: (x: number) => number; Y: (y: number) => number } | null>(null);
  const view = useMemo(() => fitView(results.map((r) => r.x), results.map((r) => r.y)), [results]);
  const orients = useMemo(() => [...new Set(results.map((r) => r.orient))], [results]);
  const color = (r: TrialResult) => theme.series[orients.indexOf(r.orient) % 8];

  const { boxRef, canvasRef } = useCanvas((w) => Math.min(380, Math.round(w * 0.6)), (ctx, w, h) => {
    const s = Math.min(w, h) / (2 * view.half);
    const X = (x: number) => w / 2 + x * s, Y = (y: number) => h / 2 - y * s;
    geom.current = { X, Y };
    drawField(ctx, theme, w, h, X, Y, s, view);
    results.forEach((r, k) => {
      const sel = Math.abs(r.orient - selected.orient) < 1e-9 && Math.abs(r.gradSteep - selected.gradSteep) < 1e-9 && r.repeat === 0;
      ctx.strokeStyle = color(r);
      ctx.globalAlpha = hover === null || hover === k || sel ? 1 : 0.35;
      ctx.lineWidth = sel || hover === k ? 2.5 : 1.25;
      ctx.setLineDash(r.repeat > 0 ? [4, 3] : []);
      if (r.x.length) path(ctx, r.x, r.y, X, Y);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
  }, [results, selected, hover, theme, view]);

  const nearest = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = geom.current;
    if (!g) return -1;
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best = -1, bd = 150;
    results.forEach((r, k) => {
      for (let i = 0; i < r.x.length; i += 4) {
        const d = (g.X(r.x[i]) - mx) ** 2 + (g.Y(r.y[i]) - my) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
    });
    return best;
  };

  const mean = results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length);
  const hr = hover !== null ? results[hover] : null;
  return (
    <div>
      <div className="stats" style={{ marginBottom: 6 }}>
        <div className="stat"><span className="v num">{fmt(mean, 4)}</span><span className="l">fitness (mean over {results.length} runs)</span></div>
        <div className="stat"><span className="v num">{fmt(Math.min(...results.map((r) => r.score)), 3)}</span><span className="l">worst run</span></div>
      </div>
      <div className="legend" style={{ marginBottom: 4 }}>
        {orients.map((o, k) => <span key={o} className="chip"><span className="swatch" style={{ background: theme.series[k % 8] }} />heading {fmt((o * 180) / Math.PI, 0)}°</span>)}
        <span className="muted small">dashed: second run (nervous system not reset) · click a run to load it</span>
      </div>
      <div ref={boxRef} className="canvas-box" style={{ borderRadius: 6, overflow: 'hidden' }}>
        <canvas ref={canvasRef} style={{ cursor: 'pointer' }}
          onMouseMove={(e) => { const k = nearest(e); setHover(k >= 0 ? k : null); }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const k = nearest(e); if (k >= 0) onSelect(results[k]); }} />
        {hr && (
          <div className="tooltip num" style={{ left: 10, top: 10 }}>
            heading {fmt((hr.orient * 180) / Math.PI, 0)}° · steepness {hr.gradSteep} · run {hr.repeat + 1}<br />score {fmt(hr.score, 4)}
          </div>
        )}
      </div>
    </div>
  );
}
