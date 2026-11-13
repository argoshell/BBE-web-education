// Views shared by the minimally cognitive visual tasks (orientation, delayed response, selective attention).

import { useRef, useState } from 'react';
import type { Recording } from '../../../sim/core/recording';
import { BODY_SIZE, ENV_HEIGHT, ENV_WIDTH, OBJECT_SIZE, rayAngle, type Eye } from '../../../sim/agents/minimal/body';
import type { PathSample } from '../../../sim/agents/minimal/common';
import { useCanvas } from '../../hooks/useCanvas';
import { drawXAxis, drawYTicks, fmt, linear, niceTicks } from '../../plot';
import { useTheme, withAlpha } from '../../theme';

/** The world (400 × 275) with the agent, its rays and the falling objects at sample idx, plus their trails. */
export function FallArena({ rec, idx, eye, objects, colors, note }: { rec: Recording; idx: number; eye: Eye; objects: number; colors: string[]; note?: string }) {
  const theme = useTheme();
  const { boxRef, canvasRef } = useCanvas((w) => Math.min(380, Math.round(w * 0.62)), (ctx, w, h) => {
    const ch = rec.channels, i = Math.min(idx, rec.t.length - 1);
    // Headroom above the world for an object at its top edge
    const pad = 8, s = Math.min((w - 2 * pad) / ENV_WIDTH, (h - 2 * pad) / (ENV_HEIGHT + BODY_SIZE / 2 + OBJECT_SIZE / 2));
    const ox = (w - ENV_WIDTH * s) / 2;
    const X = (x: number) => ox + (x + ENV_WIDTH / 2) * s, Y = (y: number) => h - pad - (y + BODY_SIZE / 2) * s;
    ctx.fillStyle = theme.surface2;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = theme.axis;
    ctx.strokeRect(X(-ENV_WIDTH / 2) + 0.5, Y(ENV_HEIGHT) + 0.5, ENV_WIDTH * s, (ENV_HEIGHT + BODY_SIZE / 2) * s);
    const ax = ch.agentX[i], blind = ch.blind?.[i] === 1;
    // Trails
    for (let k = 1; k <= objects; k++) {
      ctx.strokeStyle = withAlpha(colors[k - 1], 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      for (let j = 0; j <= i; j += 2) {
        const x = ch[`ox${k}`][j], y = ch[`oy${k}`][j];
        if (!started) { ctx.moveTo(X(x), Y(y)); started = true; } else ctx.lineTo(X(x), Y(y));
      }
      ctx.stroke();
    }
    ctx.strokeStyle = withAlpha(theme.text2, 0.35);
    ctx.beginPath();
    for (let j = 0; j <= i; j += 2) (j ? ctx.lineTo : ctx.moveTo).call(ctx, X(ch.agentX[j]), Y(0));
    ctx.stroke();
    // Rays
    for (let r = 0; r < eye.rays; r++) {
      const th = rayAngle(eye, r), len = ch[`ray${r + 1}`][i], hit = len < eye.length - 1e-9;
      const x1 = ax + (BODY_SIZE / 2) * Math.sin(th), y1 = (BODY_SIZE / 2) * Math.cos(th);
      ctx.strokeStyle = blind ? withAlpha(theme.muted, 0.25) : hit ? theme.text : withAlpha(theme.muted, 0.5);
      ctx.lineWidth = hit && !blind ? 1.4 : 0.8;
      if (blind) ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(X(x1), Y(y1));
      ctx.lineTo(X(x1 + len * Math.sin(th)), Y(y1 + len * Math.cos(th)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Objects
    for (let k = 1; k <= objects; k++) {
      const active = ch[`act${k}`][i] === 1;
      ctx.beginPath();
      ctx.arc(X(ch[`ox${k}`][i]), Y(ch[`oy${k}`][i]), (OBJECT_SIZE / 2) * s, 0, 2 * Math.PI);
      ctx.fillStyle = withAlpha(colors[k - 1], active ? 0.3 : 0.1);
      ctx.fill();
      ctx.strokeStyle = withAlpha(colors[k - 1], active ? 1 : 0.4);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Agent
    ctx.beginPath();
    ctx.arc(X(ax), Y(0), (BODY_SIZE / 2) * s, 0, 2 * Math.PI);
    ctx.fillStyle = theme.text2;
    ctx.fill();
    ctx.fillStyle = theme.text2;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`t = ${fmt(rec.t[i], 1)}${blind ? '  ·  blind (sensors off)' : ''}`, pad + 6, pad + 4);
    if (note) ctx.fillText(note, pad + 6, pad + 20);
  }, [rec, idx, eye, objects, colors, theme, note]);
  return <div ref={boxRef} className="canvas-box" style={{ borderRadius: 6, overflow: 'hidden' }}><canvas ref={canvasRef} /></div>;
}

const PAD = { l: 46, r: 12, t: 10, b: 34 };

export interface PathItem { paths: PathSample; label: string; selected: boolean }

/**
 * Object paths relative to the agent (object x − agent x against object height), one line per trial,
 * as in Slocum et al.'s motion plots. Click a line to select its trial.
 */
export function RelativePaths({ items, colors, onSelect, height = 280 }: { items: PathItem[]; colors: string[]; onSelect: (i: number) => void; height?: number }) {
  const theme = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const geom = useRef({ w: 0 });
  const xr: [number, number] = [-120, 120], yr: [number, number] = [0, ENV_HEIGHT];
  const scales = (w: number) => ({ x: linear(xr[0], xr[1], PAD.l, w - PAD.r), y: linear(yr[0], yr[1], height - PAD.b, PAD.t) });
  const { boxRef, canvasRef } = useCanvas(height, (ctx, w) => {
    geom.current.w = w;
    const { x, y } = scales(w);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(yr[0], yr[1], 5), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, height - PAD.b, PAD.l, w - PAD.r, niceTicks(xr[0], xr[1], 7), theme.axis, theme.muted, 'object x − agent x');
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.l, PAD.t, w - PAD.l - PAD.r, height - PAD.t - PAD.b);
    ctx.clip();
    items.forEach((it, k) => {
      const emph = it.selected || hover === k;
      it.paths.ox.forEach((oxs, j) => {
        ctx.strokeStyle = colors[j % colors.length];
        ctx.globalAlpha = hover === null || emph ? 0.9 : 0.25;
        ctx.lineWidth = emph ? 2.4 : 1;
        ctx.beginPath();
        let started = false;
        for (let q = 0; q < oxs.length; q++) {
          const v = oxs[q] - it.paths.agentX[q], hgt = it.paths.oy[j][q];
          if (!Number.isFinite(v)) { started = false; continue; }
          if (!started) { ctx.moveTo(x(v), y(hgt)); started = true; } else ctx.lineTo(x(v), y(hgt));
        }
        ctx.stroke();
      });
    });
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.axis;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x(0) + 0.5, PAD.t);
    ctx.lineTo(x(0) + 0.5, height - PAD.b);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.translate(12, (height - PAD.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = theme.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('object height', 0, 0);
    ctx.restore();
  }, [items, colors, hover, theme, height]);

  const nearest = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const { x, y } = scales(geom.current.w);
    let best = -1, bd = 12;
    items.forEach((it, k) => it.paths.ox.forEach((oxs, j) => {
      for (let q = 0; q < oxs.length; q++) {
        const v = oxs[q] - it.paths.agentX[q];
        if (!Number.isFinite(v)) continue;
        const d = Math.hypot(x(v) - px, y(it.paths.oy[j][q]) - py);
        if (d < bd) { bd = d; best = k; }
      }
    }));
    return best < 0 ? null : best;
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <canvas ref={canvasRef} style={{ cursor: 'pointer' }} onMouseMove={(e) => setHover(nearest(e))} onMouseLeave={() => setHover(null)}
        onClick={(e) => { const k = nearest(e); if (k !== null) onSelect(k); }} />
      {hover !== null && <div className="tooltip" style={{ left: PAD.l + 8, top: PAD.t + 4 }}>{items[hover].label}</div>}
    </div>
  );
}

/** Final agent position against final object position (ideal: the diagonal), as in Slocum et al. Figures 9 and 11. */
export function AccuracyPlot({ points, color, height = 280, range = 100 }: { points: { object: number; agent: number }[]; color: string; height?: number; range?: number }) {
  const theme = useTheme();
  const { boxRef, canvasRef } = useCanvas(height, (ctx, w) => {
    const size = Math.min(w - PAD.l - PAD.r, height - PAD.t - PAD.b);
    const x = linear(-range, range, PAD.l, PAD.l + size), y = linear(-range, range, PAD.t + size, PAD.t);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(-range, range, 5), theme.grid, theme.muted, PAD.l, PAD.l + size);
    drawXAxis(ctx, x, PAD.t + size, PAD.l, PAD.l + size, niceTicks(-range, range, 5), theme.axis, theme.muted, 'final object x');
    ctx.strokeStyle = theme.muted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x(-range), y(-range));
    ctx.lineTo(x(range), y(range));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = withAlpha(color, 0.75);
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(x(p.object), y(Math.max(-range, Math.min(range, p.agent))), 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(12, PAD.t + size / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = theme.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('final agent x', 0, 0);
    ctx.restore();
  }, [points, color, theme, height, range]);
  return <div ref={boxRef}><canvas ref={canvasRef} /></div>;
}

/**
 * Horizontal positions over time of the agent and each object (Slocum et al. Figure 14), with the
 * stretches when each object is visible to the agent shaded in its color.
 */
export function PositionsOverTime({ rec, idx, objects, colors, onSeek, height = 240 }: { rec: Recording; idx: number; objects: number; colors: string[]; onSeek: (i: number) => void; height?: number }) {
  const theme = useTheme();
  const geom = useRef({ w: 0 });
  const xr: [number, number] = [-ENV_WIDTH / 2, ENV_WIDTH / 2];
  const { boxRef, canvasRef } = useCanvas(height, (ctx, w) => {
    geom.current.w = w;
    const T = rec.t[rec.t.length - 1];
    const x = linear(xr[0], xr[1], PAD.l, w - PAD.r), y = linear(0, T, PAD.t, height - PAD.b);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(0, T, 5), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, height - PAD.b, PAD.l, w - PAD.r, niceTicks(xr[0], xr[1], 9), theme.axis, theme.muted, 'horizontal position');
    const ch = rec.channels, n = rec.t.length;
    for (let k = 1; k <= objects; k++) {
      const seen = ch[`seen${k}`], act = ch[`act${k}`], oxs = ch[`ox${k}`];
      // visible stretches
      ctx.fillStyle = withAlpha(colors[k - 1], 0.18);
      for (let j = 0; j < n; j++) if (seen[j] === 1) ctx.fillRect(x(oxs[j]) - 13 * (w / ENV_WIDTH) / 2, y(rec.t[j]), 13 * (w / ENV_WIDTH), Math.max(1, y(rec.t[Math.min(n - 1, j + 1)]) - y(rec.t[j])));
      ctx.strokeStyle = colors[k - 1];
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let j = 0; j < n; j++) {
        if (act[j] !== 1 && (j === 0 || act[j - 1] !== 1)) continue;
        if (!started) { ctx.moveTo(x(oxs[j]), y(rec.t[j])); started = true; } else ctx.lineTo(x(oxs[j]), y(rec.t[j]));
      }
      ctx.stroke();
    }
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let j = 0; j < n; j++) (j ? ctx.lineTo : ctx.moveTo).call(ctx, x(ch.agentX[j]), y(rec.t[j]));
    ctx.stroke();
    const ty = Math.round(y(rec.t[Math.min(idx, n - 1)])) + 0.5;
    ctx.strokeStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(PAD.l, ty);
    ctx.lineTo(w - PAD.r, ty);
    ctx.stroke();
    ctx.save();
    ctx.translate(12, (height - PAD.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = theme.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('time ↓', 0, 0);
    ctx.restore();
  }, [rec, idx, objects, colors, theme, height]);
  const seek = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const T = rec.t[rec.t.length - 1];
    const t = linear(0, T, PAD.t, height - PAD.b).invert(e.clientY - rect.top);
    onSeek(Math.max(0, Math.min(rec.t.length - 1, Math.round((t / T) * (rec.t.length - 1)))));
  };
  return <div ref={boxRef}><canvas ref={canvasRef} style={{ cursor: 'pointer' }} onClick={seek} /></div>;
}
