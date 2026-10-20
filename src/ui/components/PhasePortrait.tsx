// Phase portrait of any two recorded channels. When both axes are neurons (both outputs
// or both states) it also draws the vector field, nullclines and fixed points of that
// 2-neuron slice, with the other neurons and inputs frozen at the current time.

import { useMemo, useState } from 'react';
import type { CircuitView } from '../../sim/agent';
import { PlaneSlice, type PlaneSpace } from '../../sim/analysis/phasePlane';
import type { ChannelSpec, Recording } from '../../sim/core/recording';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, drawYTicks, extent, fmt, linear, niceTicks, padExtent } from '../plot';
import { neuronColor, useTheme, withAlpha, type Theme } from '../theme';

export interface PhaseOverlay {
  rec: Recording;
  color: string;
  label: string;
}

interface Props {
  rec: Recording;
  channels: ChannelSpec[];
  circuitView: CircuitView | null;
  idx: number;
  window: [number, number];
  xKey: string;
  yKey: string;
  onAxes: (x: string, y: string) => void;
  overlays?: PhaseOverlay[];
  stanceKey?: string;
}

const PAD = { l: 44, r: 12, t: 10, b: 34 };

function colorOf(theme: Theme, cv: CircuitView | null, i: number): string {
  const slot = cv?.colorSlot ? cv.colorSlot(i) : i + 1;
  return slot > 0 ? neuronColor(theme, slot) : theme.text2;
}

function nameOf(cv: CircuitView | null, i: number): string {
  return cv?.name ? cv.name(i) : `n${i + 1}`;
}

function neuronOf(cv: CircuitView | null, key: string): { i: number; space: PlaneSpace } | null {
  if (!cv) return null;
  for (let i = 0; i < cv.circuit.size; i++) {
    if (cv.outputKey(i) === key) return { i, space: 'output' };
    if (cv.stateKey(i) === key) return { i, space: 'state' };
  }
  return null;
}

export function PhasePortrait({ rec, channels, circuitView, idx, window: [i0, i1], xKey, yKey, onAxes, overlays = [], stanceKey }: Props) {
  const theme = useTheme();
  const [showField, setShowField] = useState(true);
  const [showNull, setShowNull] = useState(true);
  const [showFixed, setShowFixed] = useState(true);
  const [byStance, setByStance] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number; px: number; py: number } | null>(null);

  const nx = neuronOf(circuitView, xKey), ny = neuronOf(circuitView, yKey);
  // Flow and nullclines describe the current individual only, so they are hidden while comparing.
  const plane = overlays.length === 0 && nx && ny && nx.space === ny.space && nx.i !== ny.i ? { i: nx.i, j: ny.i, space: nx.space } : null;
  const xs = rec.channels[xKey], ys = rec.channels[yKey];
  const end = Math.min(i1, rec.t.length - 1);
  const specOf = (key: string) => channels.find((c) => c.key === key);

  const ranges = useMemo(() => {
    const r = (key: string, data: Float64Array | undefined): [number, number] => {
      const spec = specOf(key);
      if (spec?.range) return padExtent(spec.range, 0.03);
      if (!data) return [0, 1];
      let [lo, hi] = extent(data, i0, end + 1);
      for (const o of overlays) {
        const d = o.rec.channels[key];
        if (d) { const [a, b] = extent(d, i0, Math.min(end + 1, d.length)); lo = Math.min(lo, a); hi = Math.max(hi, b); }
      }
      return padExtent([lo, hi], plane ? 0.25 : 0.08);
    };
    return { x: r(xKey, xs), y: r(yKey, ys) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec, xKey, yKey, i0, end, overlays, plane?.space]);

  const slice = useMemo(() => {
    if (!plane || !circuitView) return null;
    const n = circuitView.circuit.size;
    const outputs = Array.from({ length: n }, (_, k) => rec.channels[circuitView.outputKey(k)]?.[idx] ?? 0);
    const inputs = Array.from({ length: n }, (_, k) => rec.channels[circuitView.inputKey(k)]?.[idx] ?? 0);
    return new PlaneSlice({ circuit: circuitView.circuit, i: plane.i, j: plane.j, space: plane.space, outputs, inputs, xRange: ranges.x, yRange: ranges.y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuitView, plane?.i, plane?.j, plane?.space, rec, idx, ranges]);

  const analysis = useMemo(() => {
    if (!slice) return null;
    return { null: slice.nullclines(110), fixed: slice.fixedPoints() };
  }, [slice]);

  const { boxRef, canvasRef, width } = useCanvas((w) => Math.max(240, Math.min(w, 440)), (ctx, w, h) => {
    const x = linear(ranges.x[0], ranges.x[1], PAD.l, w - PAD.r);
    const y = linear(ranges.y[0], ranges.y[1], h - PAD.b, PAD.t);
    ctx.fillStyle = theme.surface2;
    ctx.fillRect(PAD.l, PAD.t, w - PAD.l - PAD.r, h - PAD.t - PAD.b);
    drawYTicks(ctx, y, PAD.l - 4, niceTicks(ranges.y[0], ranges.y[1], 5), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(ranges.x[0], ranges.x[1], 5), theme.axis, theme.muted, specOf(xKey)?.label ?? xKey);
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.l, PAD.t, w - PAD.l - PAD.r, h - PAD.t - PAD.b);
    ctx.clip();

    // Vector field
    if (slice && showField) {
      const G = 17;
      ctx.strokeStyle = withAlpha(theme.muted, 0.7);
      ctx.fillStyle = withAlpha(theme.muted, 0.7);
      ctx.lineWidth = 1;
      const cell = (w - PAD.l - PAD.r) / G;
      for (let a = 0; a < G; a++)
        for (let b = 0; b < G; b++) {
          const px = PAD.l + (a + 0.5) * cell, py = PAD.t + (b + 0.5) * ((h - PAD.t - PAD.b) / G);
          const vx0 = x.invert(px), vy0 = y.invert(py);
          const [dx, dy] = slice.velocity(vx0, vy0);
          // Direction in pixel space
          let ux = x(vx0 + dx) - x(vx0), uy = y(vy0 + dy) - y(vy0);
          const m = Math.hypot(ux, uy);
          if (!(m > 0)) continue;
          const len = Math.min(cell * 0.42, 3 + 4 * Math.log1p(m));
          ux = (ux / m) * len; uy = (uy / m) * len;
          ctx.beginPath();
          ctx.moveTo(px - ux, py - uy);
          ctx.lineTo(px + ux, py + uy);
          ctx.stroke();
          const ang = Math.atan2(uy, ux);
          ctx.beginPath();
          ctx.moveTo(px + ux, py + uy);
          ctx.lineTo(px + ux - 4 * Math.cos(ang - 0.45), py + uy - 4 * Math.sin(ang - 0.45));
          ctx.lineTo(px + ux - 4 * Math.cos(ang + 0.45), py + uy - 4 * Math.sin(ang + 0.45));
          ctx.closePath();
          ctx.fill();
        }
    }

    // Nullclines
    if (analysis && showNull && plane) {
      ctx.lineWidth = 2;
      for (const [segs, i] of [[analysis.null.xNull, plane.i], [analysis.null.yNull, plane.j]] as const) {
        ctx.strokeStyle = withAlpha(colorOf(theme, circuitView, i), 0.8);
        ctx.beginPath();
        for (const [a, b, c, d] of segs) { ctx.moveTo(x(a), y(b)); ctx.lineTo(x(c), y(d)); }
        ctx.stroke();
      }
    }

    // Overlay trajectories (compare mode)
    for (const o of overlays) {
      const ox = o.rec.channels[xKey], oy = o.rec.channels[yKey];
      if (!ox || !oy) continue;
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const oe = Math.min(end, ox.length - 1);
      for (let k = i0; k <= oe; k++) (k === i0 ? ctx.moveTo : ctx.lineTo).call(ctx, x(ox[k]), y(oy[k]));
      ctx.stroke();
    }

    // Main trajectory (plain ink while comparing)
    if (xs && ys) {
      const stance = stanceKey && overlays.length === 0 ? rec.channels[stanceKey] : undefined;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      let k = i0;
      while (k < end) {
        const s = byStance && stance ? stance[k + 1] : 1;
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = s === 1 ? 2 : 1.25;
        ctx.setLineDash(s === 1 ? [] : [4, 3]);
        ctx.beginPath();
        ctx.moveTo(x(xs[k]), y(ys[k]));
        while (k < end && (!byStance || !stance || stance[k + 1] === s)) { k++; ctx.lineTo(x(xs[k]), y(ys[k])); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Fixed points
    if (analysis && showFixed) {
      for (const p of analysis.fixed) {
        const px = x(p.x), py = y(p.y);
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = theme.text;
        ctx.fillStyle = p.stable ? theme.text : theme.surface;
        ctx.fill();
        ctx.stroke();
        if (p.kind === 'saddle') {
          ctx.beginPath();
          ctx.moveTo(px - 3, py - 3); ctx.lineTo(px + 3, py + 3);
          ctx.moveTo(px + 3, py - 3); ctx.lineTo(px - 3, py + 3);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    // Current state
    if (xs && ys && idx >= 0 && idx < xs.length) {
      ctx.beginPath();
      ctx.arc(x(xs[idx]), y(ys[idx]), 5, 0, Math.PI * 2);
      ctx.fillStyle = theme.text;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.surface;
      ctx.stroke();
    }
    ctx.restore();
    // Y label
    ctx.save();
    ctx.fillStyle = theme.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.translate(10, PAD.t);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(specOf(yKey)?.label ?? yKey, 0, 0);
    ctx.restore();
  }, [rec, xKey, yKey, idx, i0, end, ranges, slice, analysis, showField, showNull, showFixed, byStance, theme, overlays, stanceKey]);

  const groups = [...new Set(channels.map((c) => c.group))];
  const select = (value: string, on: (v: string) => void) => (
    <select value={value} onChange={(e) => on(e.target.value)}>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {channels.filter((c) => c.group === g).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </optgroup>
      ))}
    </select>
  );

  const h = Math.max(240, Math.min(width, 440));
  return (
    <div>
      <div className="inline small" style={{ marginBottom: 6 }}>
        <span className="muted">x</span>{select(xKey, (v) => onAxes(v, yKey))}
        <span className="muted">y</span>{select(yKey, (v) => onAxes(xKey, v))}
      </div>
      <div ref={boxRef} className="canvas-box">
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - r.left, py = e.clientY - r.top;
            const x = linear(ranges.x[0], ranges.x[1], PAD.l, width - PAD.r);
            const y = linear(ranges.y[0], ranges.y[1], h - PAD.b, PAD.t);
            setHover({ x: x.invert(px), y: y.invert(py), px, py });
          }}
          onMouseLeave={() => setHover(null)}
        />
        {hover && (
          <div className="tooltip num" style={{ left: Math.min(hover.px + 12, width - 150), top: hover.py + 12 }}>
            ({fmt(hover.x, 3)}, {fmt(hover.y, 3)})
            {slice && (() => { const [dx, dy] = slice.velocity(hover.x, hover.y); return <div className="muted">flow ({fmt(dx, 3)}, {fmt(dy, 3)})</div>; })()}
          </div>
        )}
      </div>
      <div className="legend" style={{ marginTop: 6 }}>
        {overlays.length === 0 && stanceKey && byStance && <>
          <span className="chip"><LineKey color={theme.text} />stance</span>
          <span className="chip"><LineKey color={theme.text} dashed />swing</span>
        </>}
        {overlays.length > 0 && <span className="chip"><LineKey color={theme.text} />current</span>}
        {overlays.map((o) => <span key={o.label} className="chip"><span className="swatch" style={{ background: o.color }} />{o.label}</span>)}
        {plane && showNull && <>
          <span className="chip"><span className="swatch" style={{ background: colorOf(theme, circuitView, plane.i) }} />{nameOf(circuitView, plane.i)} nullcline</span>
          <span className="chip"><span className="swatch" style={{ background: colorOf(theme, circuitView, plane.j) }} />{nameOf(circuitView, plane.j)} nullcline</span>
        </>}
        {plane && showFixed && <span className="chip">● stable · ○ unstable · ⊗ saddle</span>}
      </div>
      <div className="inline small" style={{ marginTop: 6 }}>
        {stanceKey && overlays.length === 0 && <label className="chip"><input type="checkbox" checked={byStance} onChange={(e) => setByStance(e.target.checked)} />color by stance</label>}
        {plane ? <>
          <label className="chip"><input type="checkbox" checked={showField} onChange={(e) => setShowField(e.target.checked)} />flow</label>
          <label className="chip"><input type="checkbox" checked={showNull} onChange={(e) => setShowNull(e.target.checked)} />nullclines</label>
          <label className="chip"><input type="checkbox" checked={showFixed} onChange={(e) => setShowFixed(e.target.checked)} />fixed points</label>
          <span className="muted">others frozen at t = {fmt(rec.t[idx], 1)}</span>
        </> : overlays.length > 0
          ? <span className="muted">Comparing pinned individuals. Untick “show pinned” to see flow and nullclines.</span>
          : <span className="muted">Choose two neuron outputs (or two states) for flow and nullclines.</span>}
      </div>
    </div>
  );
}

function LineKey({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="18" height="8" aria-hidden>
      <line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth={dashed ? 1.25 : 2} strokeDasharray={dashed ? '4 3' : undefined} />
    </svg>
  );
}
