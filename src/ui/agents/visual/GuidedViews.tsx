// Views for the visually guided tasks (Izquierdo, Beer & Setzler): the arena with a falling circle
// or aperture, an overview of every trial, and a score map over the (position, size) grid.

import { useCallback, useMemo, useRef, useState } from 'react';
import { BodySize, MaxRayLength, VisualAngle } from '../../../sim/agents/visual/body';
import { NUMRAYS, OBJECTHEIGHT, STARTHEIGHT, taskInfo, type GuidedTask, type GuidedTrialResult } from '../../../sim/agents/visual/guided';
import type { Recording } from '../../../sim/core/recording';
import { useCanvas } from '../../hooks/useCanvas';
import { drawXAxis, drawYTicks, fmt, linear, niceTicks } from '../../plot';
import { divergingColor, useTheme, withAlpha } from '../../theme';

const X_RANGE: [number, number] = [-110, 110];
const Y_RANGE: [number, number] = [-22, 256];

/** Top-down arena: agent, its 15 rays, and the falling circle or aperture at the current time. */
export function GuidedArena({ rec, idx, task, pos, size }: { rec: Recording; idx: number; task: GuidedTask; pos: number; size: number }) {
  const theme = useTheme();
  const { boxRef, canvasRef } = useCanvas((w) => Math.min(360, Math.round(w * 0.52)), (ctx, w, h) => {
    const ch = rec.channels;
    const i = Math.min(idx, rec.t.length - 1);
    const s = Math.min(w / (X_RANGE[1] - X_RANGE[0]), h / (Y_RANGE[1] - Y_RANGE[0]));
    const X = (x: number) => w / 2 + x * s;
    const Y = (y: number) => h - (y - Y_RANGE[0]) * s;
    ctx.fillStyle = theme.surface2;
    ctx.fillRect(0, 0, w, h);
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

    const ax = ch.agentX[i], oy = ch.objectY[i];
    // Stimulus path and the end-of-trial height
    ctx.strokeStyle = withAlpha(theme.muted, 0.35);
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(X(pos), Y(STARTHEIGHT));
    ctx.lineTo(X(pos), Y(BodySize));
    ctx.moveTo(0, Y(BodySize));
    ctx.lineTo(w, Y(BodySize));
    ctx.stroke();
    ctx.setLineDash([]);
    // Agent trail (agent x against object height)
    ctx.strokeStyle = withAlpha(theme.text2, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k <= i; k++) {
      const px = X(ch.agentX[k]), py = Y(ch.objectY[k]);
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // Rays
    for (let r = 0; r < NUMRAYS; r++) {
      const theta = -VisualAngle / 2 + (r * VisualAngle) / (NUMRAYS - 1);
      const len = ch[`ray${r + 1}`][i];
      const sx = ax + (BodySize / 2) * Math.sin(theta), sy = (BodySize / 2) * Math.cos(theta);
      const hit = len < MaxRayLength;
      ctx.strokeStyle = hit ? theme.text : withAlpha(theme.muted, 0.45);
      ctx.lineWidth = hit ? 1.25 : 0.75;
      ctx.beginPath();
      ctx.moveTo(X(sx), Y(sy));
      ctx.lineTo(X(sx + len * Math.sin(theta)), Y(sy + len * Math.cos(theta)));
      ctx.stroke();
    }
    // Stimulus
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.text;
    if (task === 'size') {
      ctx.beginPath();
      ctx.arc(X(pos), Y(oy), (size / 2) * s, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(theme.text, 0.15);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      for (const c of [pos - size / 2 - OBJECTHEIGHT / 2, pos + size / 2 + OBJECTHEIGHT / 2]) {
        ctx.moveTo(X(c - OBJECTHEIGHT / 2), Y(oy));
        ctx.lineTo(X(c + OBJECTHEIGHT / 2), Y(oy));
      }
      ctx.stroke();
      // Gap width marker
      ctx.strokeStyle = withAlpha(theme.text2, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(pos - size / 2), Y(oy) - 6);
      ctx.lineTo(X(pos - size / 2), Y(oy) + 6);
      ctx.moveTo(X(pos + size / 2), Y(oy) - 6);
      ctx.lineTo(X(pos + size / 2), Y(oy) + 6);
      ctx.stroke();
    }
    // Agent body
    ctx.beginPath();
    ctx.arc(X(ax), Y(0), (BodySize / 2) * s, 0, Math.PI * 2);
    ctx.fillStyle = theme.text2;
    ctx.fill();
    ctx.fillStyle = theme.text2;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`agent x = ${fmt(ax, 1)}   ${task === 'size' ? 'circle' : 'wall'} height = ${fmt(oy, 0)}   Δx = ${fmt(ax - pos, 1)}`, 8, 8);
  }, [rec, idx, task, pos, size, theme]);
  return <div ref={boxRef} className="canvas-box" style={{ borderRadius: 6, overflow: 'hidden' }}><canvas ref={canvasRef} /></div>;
}

const PAD = { l: 46, r: 12, t: 10, b: 34 };

/** Trials whose correct response is to end centered under the object (catch / pass through). */
function approachTrial(task: GuidedTask, size: number): boolean {
  return (size < BodySize) === (task === 'size');
}

/** One panel of trials on shared axes. */
function GuidedTrialPanel({ results, color, isSel, onSelect, maxDistance, xr, task }: {
  results: GuidedTrialResult[];
  color: string;
  isSel: (r: GuidedTrialResult) => boolean;
  onSelect: (pos: number, size: number) => void;
  maxDistance: number;
  xr: [number, number];
  task: GuidedTask;
}) {
  const theme = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const geom = useRef({ w: 0, h: 0 });
  const { boxRef, canvasRef, width } = useCanvas(300, (ctx, w, h) => {
    geom.current = { w, h };
    const x = linear(xr[0], xr[1], PAD.l, w - PAD.r), y = linear(0, 250, h - PAD.b, PAD.t);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(0, 250, 5), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(xr[0], xr[1], 6), theme.axis, theme.muted, 'agent x − object x');
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
      const sel = isSel(r);
      ctx.strokeStyle = color;
      ctx.globalAlpha = hover === null || hover === k || sel ? 0.9 : 0.25;
      ctx.lineWidth = sel || hover === k ? 2.5 : 1;
      ctx.beginPath();
      for (let q = 0; q < r.relX.length; q++) (q ? ctx.lineTo : ctx.moveTo).call(ctx, x(r.relX[q]), y(r.objY[q]));
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }, [results, hover, theme, xr, maxDistance, color, isSel]);
  const nearest = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const x = linear(xr[0], xr[1], PAD.l, geom.current.w - PAD.r), y = linear(0, 250, geom.current.h - PAD.b, PAD.t);
    let best = -1, bd = 120;
    results.forEach((r, k) => {
      for (let q = 0; q < r.relX.length; q += 2) {
        const d = (x(r.relX[q]) - mx) ** 2 + (y(r.objY[q]) - my) ** 2;
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
        onClick={(e) => { const k = nearest(e); if (k >= 0) onSelect(results[k].pos, results[k].size); }} />
      {hr && (
        <div className="tooltip num" style={{ left: Math.min(60, width - 200), top: 10 }}>
          {task === 'size' ? 'circle' : 'gap'} {fmt(hr.size, 1)} at x = {fmt(hr.pos, 1)}<br />final Δx {fmt(hr.finalDx, 1)} · score {fmt(hr.score, 3)}
        </div>
      )}
    </div>
  );
}

/**
 * Every trial, split by the required response: approach trials (catch a small circle, pass a
 * wide aperture) should end near 0; avoid trials far from it. Shared axes; click a trial to load it.
 */
export function GuidedTrialsOverview({ results, task, selected, onSelect, maxDistance }: {
  results: GuidedTrialResult[];
  task: GuidedTask;
  selected: { pos: number; size: number };
  onSelect: (pos: number, size: number) => void;
  maxDistance: number;
}) {
  const theme = useTheme();
  const xr = useMemo((): [number, number] => {
    let m = 60;
    for (const r of results) for (const v of r.relX) m = Math.max(m, Math.abs(v));
    return [-m * 1.05, m * 1.05];
  }, [results]);
  const isSel = useCallback((r: GuidedTrialResult) => Math.abs(r.pos - selected.pos) < 1e-9 && Math.abs(r.size - selected.size) < 1e-9, [selected.pos, selected.size]);
  const approach = useMemo(() => results.filter((r) => approachTrial(task, r.size)), [results, task]);
  const avoid = useMemo(() => results.filter((r) => !approachTrial(task, r.size)), [results, task]);
  const mean = (a: GuidedTrialResult[]) => a.reduce((q, r) => q + r.score, 0) / Math.max(1, a.length);
  const approachLabel = task === 'size' ? 'Small circles (< body): catch' : 'Wide gaps (> body): pass through';
  const avoidLabel = task === 'size' ? 'Large circles (> body): avoid' : 'Narrow gaps (< body): avoid';
  return (
    <div>
      <div className="stats" style={{ marginBottom: 6 }}>
        <div className="stat"><span className="v num">{fmt(mean(results), 3)}</span><span className="l">task fitness (mean score)</span></div>
        <div className="stat"><span className="v num">{fmt(mean(approach), 3)}</span><span className="l">{task === 'size' ? 'catch' : 'pass through'} trials</span></div>
        <div className="stat"><span className="v num">{fmt(mean(avoid), 3)}</span><span className="l">avoid trials</span></div>
      </div>
      <p className="muted small" style={{ marginBottom: 6 }}>Shaded: within a body width · vertical rules: ±{maxDistance} scoring limit · click a trial to load it.</p>
      <div className="split-2">
        <div>
          <h3 className="inline" style={{ marginBottom: 4 }}><span className="swatch" style={{ background: theme.series[0] }} />{approachLabel} ({approach.length}, score {fmt(mean(approach), 3)})</h3>
          <GuidedTrialPanel results={approach} color={theme.series[0]} isSel={isSel} onSelect={onSelect} maxDistance={maxDistance} xr={xr} task={task} />
        </div>
        <div>
          <h3 className="inline" style={{ marginBottom: 4 }}><span className="swatch" style={{ background: theme.series[1] }} />{avoidLabel} ({avoid.length}, score {fmt(mean(avoid), 3)})</h3>
          <GuidedTrialPanel results={avoid} color={theme.series[1]} isSel={isSel} onSelect={onSelect} maxDistance={maxDistance} xr={xr} task={task} />
        </div>
      </div>
    </div>
  );
}

/** Score of every trial on the (start position × size) grid; click a cell to load that trial. */
export function GuidedScoreMap({ results, task, selected, onSelect }: {
  results: GuidedTrialResult[];
  task: GuidedTask;
  selected: { pos: number; size: number };
  onSelect: (pos: number, size: number) => void;
}) {
  const theme = useTheme();
  const poss = [...new Set(results.map((r) => r.pos))].sort((a, b) => a - b);
  const sizes = [...new Set(results.map((r) => r.size))].sort((a, b) => a - b);
  const at = new Map(results.map((r) => [`${r.pos},${r.size}`, r]));
  return (
    <div>
      <div className="small secondary" style={{ marginBottom: 4 }}>Score per trial (rows: {task === 'size' ? 'circle diameter' : 'gap width'}; columns: start x)</div>
      <div style={{ display: 'grid', gridTemplateColumns: `36px repeat(${poss.length}, minmax(0, 1fr))`, gap: 1, fontSize: 10 }} className="num">
        <div />
        {poss.map((p) => <div key={p} className="muted" style={{ textAlign: 'center' }}>{fmt(p, 0)}</div>)}
        {sizes.slice().reverse().flatMap((sz) => [
          <div key={`h${sz}`} className="muted" style={{ textAlign: 'right', paddingRight: 4, fontWeight: sz < BodySize ? 400 : 600 }}>{fmt(sz, 0)}</div>,
          ...poss.map((p) => {
            const r = at.get(`${p},${sz}`);
            const sel = Math.abs(p - selected.pos) < 1e-9 && Math.abs(sz - selected.size) < 1e-9;
            return (
              <button key={`${p},${sz}`} title={r ? `${task === 'size' ? 'circle' : 'gap'} ${sz} at x = ${p}: score ${fmt(r.score, 3)}` : ''}
                onClick={() => r && onSelect(p, sz)}
                style={{
                  height: 14, padding: 0, border: sel ? `2px solid ${theme.text}` : '1px solid transparent', borderRadius: 2, cursor: 'pointer',
                  // score 1 = good (blue pole), 0 = bad (red pole), 0.5 neutral
                  background: r ? divergingColor(theme, 1 - 2 * r.score) : 'transparent',
                }} />
            );
          }),
        ])}
      </div>
      <div className="legend small muted" style={{ marginTop: 4 }}>
        <span className="chip"><span className="swatch" style={{ background: divergingColor(theme, -1) }} />score 1</span>
        <span className="chip"><span className="swatch" style={{ background: divergingColor(theme, 0) }} />0.5</span>
        <span className="chip"><span className="swatch" style={{ background: divergingColor(theme, 1) }} />0</span>
        <span>body width {BodySize}: rows above it need the “{taskInfo[task].large}” response</span>
      </div>
    </div>
  );
}
