// Views for the relational categorization agent: arena, all-trials overview and score matrix.

import { useMemo, useRef, useState } from 'react';
import type { RelcatTrialResult } from '../../../sim/agents/relcat';
import type { RelcatParams } from '../../../sim/agents/relcat/body';
import type { Recording } from '../../../sim/core/recording';
import { useCanvas } from '../../hooks/useCanvas';
import { drawXAxis, drawYTicks, fmt, linear, niceTicks } from '../../plot';
import { useTheme, withAlpha, type Theme } from '../../theme';

/** Sequential single-hue ramp for scores in [0, 1] (light to dark; flipped on dark surfaces). */
function scoreColor(theme: Theme, t: number): string {
  const dark = parseInt(theme.surface.replace('#', '').slice(0, 2), 16) < 128;
  const lo = dark ? [26, 26, 25] : [240, 239, 236], hi = dark ? [158, 197, 244] : [13, 54, 107];
  const c = lo.map((v, k) => Math.round(v + (hi[k] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** The world (y downward): agent at the bottom, its rays, and the falling circle. */
export function RelcatArena({ rec, idx, p, first }: { rec: Recording; idx: number; p: RelcatParams; first: number }) {
  const theme = useTheme();
  const { boxRef, canvasRef } = useCanvas((w) => Math.min(340, Math.round(w * 0.6)), (ctx, w, h) => {
    const ch = rec.channels, i = Math.min(idx, rec.t.length - 1);
    const W = p.worldRight - p.worldLeft, H = p.worldBottom - p.worldTop;
    const s = Math.min(w / W, h / H), ox = (w - W * s) / 2, oy = (h - H * s) / 2;
    const X = (x: number) => ox + (x - p.worldLeft) * s, Y = (y: number) => oy + (y - p.worldTop) * s;
    ctx.fillStyle = theme.surface2;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = theme.axis;
    ctx.strokeRect(X(p.worldLeft) + 0.5, Y(p.worldTop) + 0.5, W * s, H * s);
    const ax = ch.agentX[i], ay = p.worldBottom - p.agentRadius, phase = ch.phase[i];
    // Rays (sensor activation shown by line weight)
    const n = p.numRays;
    for (let r = 0; r < n; r++) {
      const th = n === 1 ? 0 : -p.visualAngle / 2 + (r * p.visualAngle) / (n - 1);
      const act = ch[`s${r + 1}`][i];
      const len = p.maxRayLength * (1 - act);
      const x1 = ax + p.agentRadius * Math.sin(th), y1 = ay - p.agentRadius * Math.cos(th);
      ctx.strokeStyle = act > 0 ? theme.text : withAlpha(theme.muted, 0.45);
      ctx.lineWidth = act > 0 ? 1.4 : 0.8;
      ctx.beginPath();
      ctx.moveTo(X(x1), Y(y1));
      ctx.lineTo(X(x1 + len * Math.sin(th)), Y(y1 - len * Math.cos(th)));
      ctx.stroke();
    }
    // Circle
    ctx.beginPath();
    ctx.arc(X(ch.ballX[i]), Y(ch.ballY[i]), ch.ballSize[i] * s, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(phase === 1 ? theme.series[1] : theme.series[0], 0.25);
    ctx.fill();
    ctx.strokeStyle = phase === 1 ? theme.series[1] : theme.series[0];
    ctx.lineWidth = 2;
    ctx.stroke();
    // Agent
    ctx.beginPath();
    ctx.arc(X(ax), Y(ay), p.agentRadius * s, 0, Math.PI * 2);
    ctx.fillStyle = theme.text2;
    ctx.fill();
    // During phase 2, show the remembered first circle in the corner
    ctx.fillStyle = theme.text2;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(phase === 1 ? 'Phase 1: first circle falls (agent held still)' : 'Phase 2: second circle falls (agent moves)', 8, 8);
    if (phase === 2) {
      ctx.fillText('first circle:', 8, 26);
      ctx.beginPath();
      ctx.arc(8 + 80 + (first / 2) * s, 26 + (first / 2) * s, (first / 2) * s, 0, Math.PI * 2);
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = theme.series[1];
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [rec, idx, p, first, theme]);
  return <div ref={boxRef} className="canvas-box" style={{ borderRadius: 6, overflow: 'hidden' }}><canvas ref={canvasRef} /></div>;
}

const PAD = { l: 46, r: 12, t: 10, b: 34 };

function TrialPanel({ results, color, isSel, onSelect, xr }: {
  results: RelcatTrialResult[]; color: string; isSel: (r: RelcatTrialResult) => boolean; onSelect: (a: number, b: number) => void; xr: [number, number];
}) {
  const theme = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const geom = useRef({ w: 0, h: 0 });
  const yMax = 240;
  const { boxRef, canvasRef, width } = useCanvas(280, (ctx, w, h) => {
    geom.current = { w, h };
    const x = linear(xr[0], xr[1], PAD.l, w - PAD.r), y = linear(0, yMax, h - PAD.b, PAD.t);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(0, yMax, 5), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(xr[0], xr[1], 6), theme.axis, theme.muted, 'agent x − circle x');
    results.forEach((r, k) => {
      const sel = isSel(r);
      ctx.strokeStyle = color;
      ctx.globalAlpha = hover === null || hover === k || sel ? 0.9 : 0.3;
      ctx.lineWidth = sel || hover === k ? 2.5 : 1.1;
      ctx.beginPath();
      for (let q = 0; q < r.relX.length; q++) (q ? ctx.lineTo : ctx.moveTo).call(ctx, x(r.relX[q]), y(r.gap[q]));
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }, [results, hover, theme, xr, color, isSel]);
  const nearest = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const x = linear(xr[0], xr[1], PAD.l, geom.current.w - PAD.r), y = linear(0, yMax, geom.current.h - PAD.b, PAD.t);
    let best = -1, bd = 120;
    results.forEach((r, k) => { for (let q = 0; q < r.relX.length; q += 2) { const d = (x(r.relX[q]) - mx) ** 2 + (y(r.gap[q]) - my) ** 2; if (d < bd) { bd = d; best = k; } } });
    return best;
  };
  const hr = hover !== null ? results[hover] : null;
  return (
    <div ref={boxRef} className="canvas-box">
      <canvas ref={canvasRef} style={{ cursor: 'pointer' }}
        onMouseMove={(e) => { const k = nearest(e); setHover(k >= 0 ? k : null); }} onMouseLeave={() => setHover(null)}
        onClick={(e) => { const k = nearest(e); if (k >= 0) onSelect(results[k].first, results[k].second); }} />
      {hr && <div className="tooltip num" style={{ left: Math.min(60, width - 200), top: 10 }}>first {hr.first} → second {hr.second}<br />final Δx {fmt(hr.finalDx, 1)} · score {fmt(hr.score, 3)}</div>}
    </div>
  );
}

/** Phase-2 paths of every trial, split into catch trials (second smaller) and avoid trials (second larger). */
export function RelcatOverview({ results, selected, onSelect }: { results: RelcatTrialResult[]; selected: { first: number; second: number }; onSelect: (a: number, b: number) => void }) {
  const theme = useTheme();
  const xr = useMemo((): [number, number] => {
    let m = 60;
    for (const r of results) for (const v of r.relX) m = Math.max(m, Math.abs(v));
    return [-m * 1.05, m * 1.05];
  }, [results]);
  const isSel = useMemo(() => (r: RelcatTrialResult) => r.first === selected.first && r.second === selected.second, [selected.first, selected.second]);
  const catchT = results.filter((r) => r.first > r.second), avoidT = results.filter((r) => r.first < r.second);
  const mean = (a: RelcatTrialResult[]) => a.reduce((q, r) => q + r.score, 0) / Math.max(1, a.length);
  return (
    <div>
      <div className="stats" style={{ marginBottom: 6 }}>
        <div className="stat"><span className="v num">{fmt(mean(catchT), 3)}</span><span className="l">catch trials (second smaller)</span></div>
        <div className="stat"><span className="v num">{fmt(mean(avoidT), 3)}</span><span className="l">avoid trials (second larger)</span></div>
      </div>
      <div className="split-2">
        <div>
          <h3 className="inline" style={{ marginBottom: 4 }}><span className="swatch" style={{ background: theme.series[0] }} />Second circle smaller: catch ({catchT.length})</h3>
          <TrialPanel results={catchT} color={theme.series[0]} isSel={isSel} onSelect={onSelect} xr={xr} />
        </div>
        <div>
          <h3 className="inline" style={{ marginBottom: 4 }}><span className="swatch" style={{ background: theme.series[1] }} />Second circle larger: avoid ({avoidT.length})</h3>
          <TrialPanel results={avoidT} color={theme.series[1]} isSel={isSel} onSelect={onSelect} xr={xr} />
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>Phase 2 only (the agent is held still in phase 1). Vertical axis: gap between the agent and the falling circle. Click a trial to load it.</p>
    </div>
  );
}

/** Score of each (first size, second size) pair, as in relcat's result matrix. */
export function RelcatScoreMatrix({ results, selected, onSelect }: { results: RelcatTrialResult[]; selected: { first: number; second: number }; onSelect: (a: number, b: number) => void }) {
  const theme = useTheme();
  const sizes = [...new Set(results.map((r) => r.first))].sort((a, b) => a - b);
  const cell = (a: number, b: number) => results.find((r) => r.first === a && r.second === b);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(${sizes.length}, minmax(0, 26px))`, gap: 2, fontSize: 10 }}>
        <div className="muted" title="first \ second">1st↓ 2nd→</div>
        {sizes.map((s) => <div key={s} className="muted" style={{ textAlign: 'center' }}>{s}</div>)}
        {sizes.map((a) => [
          <div key={`h${a}`} className="muted">{a}</div>,
          ...sizes.map((b) => {
            const r = cell(a, b), sel = a === selected.first && b === selected.second;
            return <div key={`${a}-${b}`} title={r ? `first ${a}, second ${b}: score ${r.score.toFixed(3)}` : 'not a trial'}
              onClick={() => r && onSelect(a, b)}
              style={{ height: 20, borderRadius: 3, cursor: r ? 'pointer' : 'default', background: r ? scoreColor(theme, r.score) : 'transparent', outline: sel ? `2px solid ${theme.text}` : 'none' }} />;
          }),
        ])}
      </div>
      <div className="legend small" style={{ marginTop: 4 }}>
        <span className="chip"><span className="swatch" style={{ width: 40, background: `linear-gradient(to right, ${scoreColor(theme, 0)}, ${scoreColor(theme, 1)})`, border: `1px solid ${theme.grid}` }} />score 0 → 1</span>
        <span className="muted">diagonal: equal sizes (not tested)</span>
      </div>
    </div>
  );
}
