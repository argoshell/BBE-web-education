// Oscillator-specific views: cycle statistics, frequency spectrum and a 2-parameter map.

import { useEffect, useMemo, useState } from 'react';
import { cycleStats, phaseLag, spectrum } from '../../../sim/analysis/oscillation';
import {
  getParam, mapCell, paramKeys, paramLabel, transientIndex, type MapCell, type MapMetric, type OscState, type ParamKey,
} from '../../../sim/agents/oscillator';
import type { Recording } from '../../../sim/core/recording';
import { bifurcationCurves } from '../../../sim/analysis/bifurcation2';
import { effectiveCircuit, setParam as setP } from '../../../sim/agents/oscillator';
import { useCanvas } from '../../hooks/useCanvas';
import { drawXAxis, drawYTicks, fmt, linear, niceTicks } from '../../plot';
import { neuronColor, useTheme, type Theme } from '../../theme';

/** Per-neuron amplitude, period, phase lag relative to neuron 1, and spectral peak. */
export function CycleTable({ rec, state }: { rec: Recording; state: OscState }) {
  const theme = useTheme();
  const n = state.circuit.size, from = transientIndex(state.run);
  const rows = useMemo(() => {
    const stats = Array.from({ length: n }, (_, i) => cycleStats(rec.t, rec.channels[`o${i + 1}`], from));
    return stats.map((s, i) => ({
      s,
      lag: i === 0 ? 0 : phaseLag(stats[0], s),
      peak: spectrum(rec.channels[`o${i + 1}`], state.run.dt, from).peakFreq,
    }));
  }, [rec, n, from, state.run.dt]);
  return (
    <table className="data">
      <thead><tr><th>neuron</th><th className="num">amplitude</th><th className="num">period</th><th className="num">phase vs n1</th><th className="num">spectral peak</th></tr></thead>
      <tbody>
        {rows.map(({ s, lag, peak }, i) => (
          <tr key={i}>
            <td><span className="swatch" style={{ background: neuronColor(theme, i + 1), marginRight: 6 }} />n{i + 1}</td>
            <td className="num">{fmt(s.amplitude, 3)}</td>
            <td className="num">{Number.isFinite(s.period) ? fmt(s.period, 3) : '—'}</td>
            <td className="num">{Number.isFinite(lag) && Number.isFinite(s.period) ? `${fmt(lag * 360, 0)}°` : '—'}</td>
            <td className="num">{Number.isFinite(s.period) && Number.isFinite(peak) ? `${fmt(peak, 3)} (1/${fmt(1 / peak, 2)})` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PAD = { l: 48, r: 12, t: 10, b: 34 };

/** Magnitude spectrum of each neuron's output after the transient. */
export function SpectrumChart({ rec, state }: { rec: Recording; state: OscState }) {
  const theme = useTheme();
  const n = state.circuit.size, from = transientIndex(state.run);
  const specs = useMemo(() => Array.from({ length: n }, (_, i) => spectrum(rec.channels[`o${i + 1}`], state.run.dt, from)), [rec, n, from, state.run.dt]);
  const fmax = useMemo(() => {
    const p = Math.max(...specs.map((s) => (Number.isFinite(s.peakFreq) ? s.peakFreq : 0)));
    return p > 0 ? Math.min(p * 6, specs[0].freq[specs[0].freq.length - 1]) : 1;
  }, [specs]);
  const { boxRef, canvasRef } = useCanvas(220, (ctx, w, h) => {
    let ymax = 0;
    for (const s of specs) for (let k = 1; k < s.freq.length && s.freq[k] <= fmax; k++) ymax = Math.max(ymax, s.mag[k]);
    ymax = ymax || 1;
    const x = linear(0, fmax, PAD.l, w - PAD.r), y = linear(0, ymax * 1.08, h - PAD.b, PAD.t);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(0, ymax * 1.08, 4), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(0, fmax, 6), theme.axis, theme.muted, 'frequency (cycles per time unit)');
    specs.forEach((s, i) => {
      ctx.strokeStyle = neuronColor(theme, i + 1);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < s.freq.length && s.freq[k] <= fmax; k++) (k ? ctx.lineTo : ctx.moveTo).call(ctx, x(s.freq[k]), y(s.mag[k]));
      ctx.stroke();
    });
  }, [specs, fmax, theme]);
  return (
    <div>
      <div className="legend" style={{ marginBottom: 4 }}>
        {specs.map((_, i) => <span key={i} className="chip"><span className="swatch" style={{ background: neuronColor(theme, i + 1) }} />n{i + 1}</span>)}
        <span className="muted small">after the transient, Hann window</span>
      </div>
      <div ref={boxRef} className="canvas-box"><canvas ref={canvasRef} /></div>
    </div>
  );
}

/** A window around the parameter's current value. */
function defaultRange(key: ParamKey, v: number): [number, number] {
  const kind = key.split(':')[0];
  const r = (lo: number, hi: number): [number, number] => [Number(lo.toFixed(2)), Number(hi.toFixed(2))];
  if (kind === 'bias') return r(v - 6, v + 6);
  if (kind === 'w') return r(v - 8, v + 8);
  if (kind === 'tau') return r(Math.max(0.1, v / 4), v * 4);
  return r(Math.max(0.05, v / 4), v * 4);
}

function seqColor(theme: Theme, t: number): string {
  const light = [205, 226, 251], dark = [13, 54, 107];
  const surfaceIsDark = parseInt(theme.surface.replace('#', '').slice(0, 2), 16) < 128;
  const [a, b] = surfaceIsDark ? [dark, light] : [light, dark];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Sweep two circuit parameters on a grid and color each cell by its behavior: oscillation
 * amplitude, period, or number of stable equilibria. Computed progressively, row by row.
 * Click a cell to load those parameter values.
 */
export function ParamMap({ state, onPick }: { state: OscState; onPick: (xKey: ParamKey, x: number, yKey: ParamKey, y: number) => void }) {
  const theme = useTheme();
  const n = state.circuit.size;
  const keys = useMemo(() => paramKeys(n), [n]);
  const [xKey, setXKey] = useState<ParamKey>('bias:0');
  const [yKey, setYKey] = useState<ParamKey>(n > 1 ? 'bias:1' : 'w:0:0');
  const [xr, setXr] = useState<[number, number]>(() => defaultRange('bias:0', getParam(state.circuit, 'bias:0')));
  const [yr, setYr] = useState<[number, number]>(() => { const k = n > 1 ? 'bias:1' : 'w:0:0'; return defaultRange(k, getParam(state.circuit, k)); });
  const [metric, setMetric] = useState<MapMetric>('amplitude');
  const [res, setRes] = useState(48);
  const [cells, setCells] = useState<(MapCell | null)[]>([]);
  const [hover, setHover] = useState<{ a: number; b: number; px: number; py: number } | null>(null);
  const [showCurves, setShowCurves] = useState(true);
  const validX = keys.includes(xKey) ? xKey : keys[0], validY = keys.includes(yKey) ? yKey : keys[Math.min(1, keys.length - 1)];

  // Everything except the two swept parameters determines the map
  const basis = JSON.stringify({ ...state, x: validX, y: validY, xr, yr, metric, res });
  useEffect(() => {
    let cancelled = false;
    const out: (MapCell | null)[] = new Array(res * res).fill(null);
    setCells(out.slice());
    let row = 0;
    const work = () => {
      if (cancelled) return;
      const t0 = performance.now();
      while (row < res && performance.now() - t0 < 30) {
        const yv = yr[0] + ((yr[1] - yr[0]) * (row + 0.5)) / res;
        for (let a = 0; a < res; a++) {
          const xv = xr[0] + ((xr[1] - xr[0]) * (a + 0.5)) / res;
          out[row * res + a] = mapCell(state, validX, xv, validY, yv, metric);
        }
        row++;
      }
      setCells(out.slice());
      if (row < res) setTimeout(work, 0);
    };
    setTimeout(work, 0);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis]);

  const done = cells.filter(Boolean).length;
  // Exact fold and Hopf curves for the two swept parameters (Dynamica's BifurcationBranches)
  const curves = useMemo(() => {
    if (!showCurves) return null;
    const base = effectiveCircuit(state), zeros = new Array(base.size).fill(0);
    try {
      return bifurcationCurves({ circuit: (a, b) => setP(setP(base, validX, a), validY, b), inputs: () => zeros }, { l1: xr, l2: yr });
    } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCurves, basis]);
  const periodMax = useMemo(() => Math.max(1, ...cells.map((c) => (c && Number.isFinite(c.period) ? c.period : 0))), [cells]);
  const stableMax = useMemo(() => Math.max(1, ...cells.map((c) => (c && Number.isFinite(c.stable) ? c.stable : 0))), [cells]);
  const colorOf = (c: MapCell): string => {
    if (metric === 'amplitude') return c.amplitude < 0.01 ? theme.surface2 : seqColor(theme, 0.15 + 0.85 * Math.min(1, c.amplitude));
    if (metric === 'period') return Number.isFinite(c.period) ? seqColor(theme, 0.15 + 0.85 * (c.period / periodMax)) : theme.surface2;
    return c.stable === 0 ? theme.surface2 : seqColor(theme, 0.25 + 0.75 * ((c.stable - 1) / Math.max(1, stableMax - 1)));
  };
  const H = (w: number) => Math.max(240, Math.min(w, 420));
  const { boxRef, canvasRef, width } = useCanvas(H, (ctx, w, h) => {
    const x = linear(xr[0], xr[1], PAD.l, w - PAD.r), y = linear(yr[0], yr[1], h - PAD.b, PAD.t);
    const cw = (w - PAD.l - PAD.r) / res, ch = (h - PAD.t - PAD.b) / res;
    for (let b = 0; b < res; b++)
      for (let a = 0; a < res; a++) {
        const c = cells[b * res + a];
        if (!c) continue;
        ctx.fillStyle = colorOf(c);
        ctx.fillRect(PAD.l + a * cw, h - PAD.b - (b + 1) * ch, cw + 0.5, ch + 0.5);
      }
    if (curves) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(PAD.l, PAD.t, w - PAD.l - PAD.r, h - PAD.t - PAD.b);
      ctx.clip();
      for (const cv of curves.curves) {
        let i = 1;
        const P = cv.points;
        while (i < P.length) {
          const kind = cv.kind === 'fold' ? 'fold' : P[i].type;
          ctx.beginPath();
          ctx.moveTo(x(P[i - 1].l1), y(P[i - 1].l2));
          while (i < P.length && (cv.kind === 'fold' ? 'fold' : P[i].type) === kind) { ctx.lineTo(x(P[i].l1), y(P[i].l2)); i++; }
          // A light halo keeps the curves readable over the colored map
          ctx.setLineDash(kind === 'hopf' ? [6, 4] : kind === 'neutral' ? [1.5, 3] : []);
          ctx.strokeStyle = theme.surface; ctx.lineWidth = kind === 'neutral' ? 2.5 : 4; ctx.stroke();
          ctx.strokeStyle = kind === 'neutral' ? theme.muted : theme.text; ctx.lineWidth = kind === 'neutral' ? 1 : 2; ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      for (const c2 of curves.codim2) {
        const px = x(c2.l1), py = y(c2.l2);
        ctx.fillStyle = theme.text; ctx.strokeStyle = theme.surface; ctx.lineWidth = 2;
        ctx.beginPath();
        if (c2.kind === 'cusp') ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        else ctx.rect(px - 4.5, py - 4.5, 9, 9);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(yr[0], yr[1], 5), 'transparent', theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(xr[0], xr[1], 6), theme.axis, theme.muted, paramLabel(validX));
    ctx.save();
    ctx.fillStyle = theme.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.translate(10, PAD.t);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(paramLabel(validY), 0, 0);
    ctx.restore();
    // Current parameters
    const cx = x(getParam(state.circuit, validX)), cy = y(getParam(state.circuit, validY));
    if (cx >= PAD.l && cx <= w - PAD.r && cy >= PAD.t && cy <= h - PAD.b) {
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = theme.series[1];
      ctx.fill();
      ctx.strokeStyle = theme.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [cells, theme, xr, yr, res, metric, state.circuit, validX, validY, curves]);

  const cellAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top, h = H(width);
    const a = Math.floor(((px - PAD.l) / (width - PAD.l - PAD.r)) * res), b = Math.floor(((h - PAD.b - py) / (h - PAD.t - PAD.b)) * res);
    return a >= 0 && a < res && b >= 0 && b < res ? { a, b, px, py } : null;
  };
  const value = (a: number, b: number) => [xr[0] + ((xr[1] - xr[0]) * (a + 0.5)) / res, yr[0] + ((yr[1] - yr[0]) * (b + 0.5)) / res];
  const select = (k: ParamKey, on: (k: ParamKey) => void, onRange: (r: [number, number]) => void) => (
    <select value={k} onChange={(e) => { on(e.target.value); onRange(defaultRange(e.target.value, getParam(state.circuit, e.target.value))); }}>
      {keys.map((p) => <option key={p} value={p}>{paramLabel(p)}</option>)}
    </select>
  );
  const rangeInputs = (r: [number, number], set: (r: [number, number]) => void) => (
    <>
      <input type="number" className="num" style={{ width: 56 }} value={r[0]} step={0.5} onChange={(e) => set([Number(e.target.value), r[1]])} />
      <input type="number" className="num" style={{ width: 56 }} value={r[1]} step={0.5} onChange={(e) => set([r[0], Number(e.target.value)])} />
    </>
  );
  const hc = hover ? cells[hover.b * res + hover.a] : null;
  const ramp = (label: string, lo: string, hi: string) => (
    <span className="chip"><span className="swatch" style={{ width: 40, background: `linear-gradient(90deg, ${seqColor(theme, 0.15)}, ${seqColor(theme, 1)})` }} />{label} {lo} → {hi}</span>
  );

  return (
    <div>
      <div className="inline small" style={{ marginBottom: 6 }}>
        <span className="muted">x</span>{select(validX, setXKey, setXr)}{rangeInputs(xr, setXr)}
        <span className="muted">y</span>{select(validY, setYKey, setYr)}{rangeInputs(yr, setYr)}
      </div>
      <div className="inline small" style={{ marginBottom: 6 }}>
        <span className="muted">color by</span>
        <select value={metric} onChange={(e) => setMetric(e.target.value as MapMetric)}>
          <option value="amplitude">oscillation amplitude</option>
          <option value="period">period</option>
          <option value="stable">number of stable equilibria</option>
        </select>
        <span className="muted">resolution</span>
        <select value={res} onChange={(e) => setRes(Number(e.target.value))}>{[24, 48, 72, 96].map((r) => <option key={r} value={r}>{r}×{r}</option>)}</select>
        <label className="chip"><input type="checkbox" checked={showCurves} onChange={(e) => setShowCurves(e.target.checked)} />bifurcation curves</label>
        <button className="btn small" title="Center both axes on the current parameter values" onClick={() => { setXr(defaultRange(validX, getParam(state.circuit, validX))); setYr(defaultRange(validY, getParam(state.circuit, validY))); }}>re-center</button>
        {done < res * res && <span className="muted">computing… {Math.round((100 * done) / (res * res))}%</span>}
      </div>
      <div ref={boxRef} className="canvas-box">
        <canvas ref={canvasRef} style={{ cursor: 'crosshair' }}
          onMouseMove={(e) => setHover(cellAt(e))} onMouseLeave={() => setHover(null)}
          onClick={(e) => { const c = cellAt(e); if (c) { const [xv, yv] = value(c.a, c.b); onPick(validX, xv, validY, yv); } }} />
        {hover && hc && (() => {
          const [xv, yv] = value(hover.a, hover.b);
          return (
            <div className="tooltip num" style={{ left: Math.min(hover.px + 12, width - 170), top: hover.py + 10 }}>
              {paramLabel(validX)} = {fmt(xv, 3)}, {paramLabel(validY)} = {fmt(yv, 3)}<br />
              {metric === 'stable' ? `${hc.stable} stable equilibri${hc.stable === 1 ? 'um' : 'a'}` :
                hc.amplitude < 0.01 ? 'no oscillation' : `amplitude ${fmt(hc.amplitude, 3)}, period ${fmt(hc.period, 2)}`}
            </div>
          );
        })()}
      </div>
      <div className="legend" style={{ marginTop: 6 }}>
        {metric === 'amplitude' && ramp('amplitude', '0', '1')}
        {metric === 'period' && ramp('period', '0', fmt(periodMax, 1))}
        {metric === 'stable' && ramp('stable equilibria', '1', String(stableMax))}
        <span className="chip"><span className="swatch" style={{ background: theme.surface2, border: `1px solid ${theme.axis}` }} />{metric === 'stable' ? 'none (limit cycle or other attractor)' : 'no oscillation'}</span>
        <span className="chip"><span className="swatch" style={{ background: theme.series[1], borderRadius: 5 }} />current parameters</span>
        {curves && <>
          <span className="chip"><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke={theme.text} strokeWidth="2" /></svg>fold curve</span>
          <span className="chip"><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke={theme.text} strokeWidth="2" strokeDasharray="6 4" /></svg>Hopf curve</span>
          <span className="chip">● cusp · ■ Bogdanov–Takens</span>
        </>}
      </div>
      <p className="small muted" style={{ marginTop: 4 }}>
        Other parameters stay as set. Each cell is a short run (dt ≥ 0.05) from the configured initial state; click a cell to load it.
        {state.centerCrossing && validX.startsWith('bias') && ' Bias axes override center-crossing.'}
      </p>
    </div>
  );
}
