// Generic evolution views: fitness over generations, ancestor chain, population explorer,
// and a genome difference heatmap. All work on RunData from any agent.

import { useMemo, useRef, useState } from 'react';
import type { IndividualRecord } from '../../sim/core/tsearch';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, drawYTicks, fmt, linear, niceTicks, padExtent } from '../plot';
import { divergingColor, useTheme } from '../theme';
import { ancestry, type RunData } from './controller';

const PAD = { l: 52, r: 70, t: 10, b: 34 };

function perfRange(run: RunData): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const g of run.generations) for (const p of g.perfs) { if (p < lo) lo = p; if (p > hi) hi = p; }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return padExtent([Math.min(0, lo), hi], 0.05);
}

interface ViewProps {
  run: RunData;
  version: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/** Best-of-generation and mean fitness. Click a generation to select its best. */
export function FitnessChart({ run, version, selectedId, onSelect }: ViewProps) {
  const theme = useTheme();
  const [hover, setHover] = useState<{ g: number; px: number; py: number } | null>(null);
  const gens = run.generations;
  const selGen = selectedId !== null ? run.archive.get(selectedId)?.born : undefined;
  const geom = useRef({ w: 0, h: 0 });

  const { boxRef, canvasRef, width } = useCanvas(240, (ctx, w, h) => {
    geom.current = { w, h };
    if (gens.length === 0) return;
    const gmax = Math.max(1, gens[gens.length - 1].gen);
    let lo = Infinity, hi = -Infinity;
    for (const g of gens) { lo = Math.min(lo, g.avg); hi = Math.max(hi, g.best); }
    const [y0, y1] = padExtent([Math.min(0, lo), hi], 0.06);
    const x = linear(0, gmax, PAD.l, w - PAD.r), y = linear(y0, y1, h - PAD.b, PAD.t);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(y0, y1, 5), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(0, gmax, 8).filter((t) => Number.isInteger(t)), theme.axis, theme.muted, 'generation');
    const line = (key: 'best' | 'avg', color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      gens.forEach((g, k) => (k ? ctx.lineTo(x(g.gen), y(g[key])) : ctx.moveTo(x(g.gen), y(g[key]))));
      ctx.stroke();
      const last = gens[gens.length - 1];
      ctx.fillStyle = theme.text2;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${key === 'best' ? 'best' : 'mean'} ${fmt(last[key], 3)}`, x(last.gen) + 6, y(last[key]));
    };
    line('avg', theme.series[1]);
    line('best', theme.series[0]);
    if (selGen !== undefined && selectedId !== null) {
      const rec = run.archive.get(selectedId);
      if (rec) {
        ctx.beginPath();
        ctx.arc(x(rec.born), y(rec.perf), 5, 0, Math.PI * 2);
        ctx.fillStyle = theme.text;
        ctx.fill();
        ctx.strokeStyle = theme.surface;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (hover) {
      const px = Math.round(x(hover.g)) + 0.5;
      ctx.strokeStyle = theme.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, PAD.t);
      ctx.lineTo(px, h - PAD.b);
      ctx.stroke();
    }
  }, [version, gens.length, theme, hover, selectedId]);

  const genAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const gmax = Math.max(1, gens[gens.length - 1]?.gen ?? 1);
    const x = linear(0, gmax, PAD.l, geom.current.w - PAD.r);
    return Math.max(0, Math.min(gens.length - 1, Math.round(x.invert(e.clientX - r.left))));
  };
  const hg = hover ? gens[hover.g] : null;
  return (
    <div>
      <div className="legend" style={{ marginBottom: 4 }}>
        <span className="chip"><span className="swatch" style={{ background: theme.series[0] }} />best of generation</span>
        <span className="chip"><span className="swatch" style={{ background: theme.series[1] }} />population mean</span>
        <span className="muted small">click a generation to load its best individual</span>
      </div>
      <div ref={boxRef} className="canvas-box">
        <canvas ref={canvasRef} style={{ cursor: 'pointer' }}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ g: genAt(e), px: e.clientX - r.left, py: e.clientY - r.top }); }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const g = gens[genAt(e)]; if (g) onSelect(g.bestId); }} />
        {hg && hover && (
          <div className="tooltip num" style={{ left: Math.min(hover.px + 12, width - 160), top: hover.py + 10 }}>
            <div>generation {hg.gen}</div>
            <div>best {fmt(hg.best, 4)} (#{hg.bestId})</div>
            <div>mean {fmt(hg.avg, 4)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function distance(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/** Ancestor chain of the selected individual back to generation 0. */
export function AncestorChain({ run, version, selectedId, onSelect, onPin }: ViewProps & { onPin: (id: number) => void }) {
  const theme = useTheme();
  const rootId = selectedId ?? run.generations[run.generations.length - 1]?.bestSoFarId ?? null;
  const chain = useMemo(() => (rootId === null ? [] : ancestry(run, rootId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, rootId, version]);
  const [hover, setHover] = useState<{ k: number; px: number; py: number } | null>(null);
  const geom = useRef({ w: 0 });
  const gmax = Math.max(1, run.generations[run.generations.length - 1]?.gen ?? 1);
  const [y0, y1] = perfRange(run);

  const { boxRef, canvasRef } = useCanvas(200, (ctx, w, h) => {
    geom.current.w = w;
    const x = linear(0, gmax, PAD.l, w - PAD.r), y = linear(y0, y1, h - PAD.b, PAD.t);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(y0, y1, 4), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(0, gmax, 8).filter((t) => Number.isInteger(t)), theme.axis, theme.muted, 'generation born');
    // Best-of-generation for context
    ctx.strokeStyle = theme.mutedMark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    run.generations.forEach((g, k) => (k ? ctx.lineTo(x(g.gen), y(g.best)) : ctx.moveTo(x(g.gen), y(g.best))));
    ctx.stroke();
    // Chain as a step line
    ctx.strokeStyle = theme.series[0];
    ctx.lineWidth = 2;
    ctx.beginPath();
    chain.forEach((a, k) => {
      if (k === 0) ctx.moveTo(x(a.born), y(a.perf));
      else { ctx.lineTo(x(a.born), y(chain[k - 1].perf)); ctx.lineTo(x(a.born), y(a.perf)); }
    });
    ctx.stroke();
    chain.forEach((a, k) => {
      ctx.beginPath();
      ctx.arc(x(a.born), y(a.perf), k === chain.length - 1 ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = k === chain.length - 1 ? theme.text : theme.series[0];
      ctx.fill();
      ctx.strokeStyle = theme.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    if (hover) {
      const a = chain[hover.k];
      if (a) { ctx.beginPath(); ctx.arc(x(a.born), y(a.perf), 7, 0, Math.PI * 2); ctx.strokeStyle = theme.text; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }, [chain, theme, hover, gmax, y0, y1]);

  const nearest = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = linear(0, gmax, PAD.l, geom.current.w - PAD.r), y = linear(y0, y1, 200 - PAD.b, PAD.t);
    let best = -1, bd = 400;
    chain.forEach((a, k) => { const d = (x(a.born) - (e.clientX - r.left)) ** 2 + (y(a.perf) - (e.clientY - r.top)) ** 2; if (d < bd) { bd = d; best = k; } });
    return best;
  };

  const rows = chain.map((a, k) => ({
    a,
    dPerf: k ? a.perf - chain[k - 1].perf : 0,
    step: k ? distance(a.genome, chain[k - 1].genome) : 0,
    cross: a.parents.length > 1,
  }));

  return (
    <div>
      <div className="legend" style={{ marginBottom: 4 }}>
        <span className="chip"><span className="swatch" style={{ background: theme.series[0] }} />ancestors of #{rootId}</span>
        <span className="chip"><span className="swatch" style={{ background: theme.mutedMark }} />best of generation</span>
        <span className="muted small">{chain.length} ancestors (first parent) · click to load</span>
      </div>
      <div ref={boxRef} className="canvas-box">
        <canvas ref={canvasRef} style={{ cursor: 'pointer' }}
          onMouseMove={(e) => { const k = nearest(e); const r = e.currentTarget.getBoundingClientRect(); setHover(k >= 0 ? { k, px: e.clientX - r.left, py: e.clientY - r.top } : null); }}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const k = nearest(e); if (k >= 0) onSelect(chain[k].id); }} />
        {hover && chain[hover.k] && (
          <div className="tooltip num" style={{ left: Math.min(hover.px + 12, geom.current.w - 150), top: hover.py + 10 }}>
            #{chain[hover.k].id} · gen {chain[hover.k].born}<br />fitness {fmt(chain[hover.k].perf, 4)}
          </div>
        )}
      </div>
      <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 8 }}>
        <table className="data">
          <thead><tr><th>id</th><th>born</th><th>parents</th><th className="num">fitness</th><th className="num">Δ fitness</th><th className="num">mutation size</th><th></th></tr></thead>
          <tbody>
            {[...rows].reverse().map(({ a, dPerf, step, cross }) => (
              <tr key={a.id} className={`clickable${a.id === selectedId ? ' sel' : ''}`} onClick={() => onSelect(a.id)}>
                <td className="num">#{a.id}</td>
                <td className="num">{a.born}</td>
                <td className="num">{a.parents.map((p) => `#${p}`).join(' × ') || '—'}{cross ? ' (crossover)' : ''}</td>
                <td className="num">{fmt(a.perf, 4)}</td>
                <td className="num">{dPerf ? (dPerf > 0 ? '+' : '') + fmt(dPerf, 4) : ''}</td>
                <td className="num">{step ? fmt(step, 3) : ''}</td>
                <td><button className="btn small" onClick={(e) => { e.stopPropagation(); onPin(a.id); }}>pin</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Every individual in every generation, as fitness vs generation. Ancestors of the selection are highlighted. */
export function PopulationScatter({ run, version, selectedId, onSelect }: ViewProps) {
  const theme = useTheme();
  const [hover, setHover] = useState<{ id: number; gen: number; perf: number; px: number; py: number } | null>(null);
  const geom = useRef({ w: 0 });
  const H = 300;
  const gmax = Math.max(1, run.generations[run.generations.length - 1]?.gen ?? 1);
  const [y0, y1] = perfRange(run);
  const lineage = useMemo(() => new Set(selectedId === null ? [] : ancestry(run, selectedId).map((a) => a.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run, selectedId, version]);

  const { boxRef, canvasRef } = useCanvas(H, (ctx, w, h) => {
    geom.current.w = w;
    const x = linear(-0.5, gmax + 0.5, PAD.l, w - PAD.r), y = linear(y0, y1, h - PAD.b, PAD.t);
    drawYTicks(ctx, y, PAD.l - 6, niceTicks(y0, y1, 5), theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(0, gmax, 8).filter((t) => Number.isInteger(t)), theme.axis, theme.muted, 'generation');
    const r = Math.max(1.2, Math.min(3, (w - PAD.l - PAD.r) / (gmax + 1) / 3));
    ctx.fillStyle = theme.mutedMark;
    for (const g of run.generations) {
      const px = x(g.gen);
      for (let k = 0; k < g.perfs.length; k++) ctx.fillRect(px - r / 2, y(g.perfs[k]) - r / 2, r, r);
    }
    // Lineage of the selection across generations it was alive in
    ctx.fillStyle = theme.series[0];
    for (const g of run.generations)
      for (let k = 0; k < g.ids.length; k++)
        if (lineage.has(g.ids[k])) { ctx.beginPath(); ctx.arc(x(g.gen), y(g.perfs[k]), 2.6, 0, Math.PI * 2); ctx.fill(); }
    if (selectedId !== null) {
      const a = run.archive.get(selectedId);
      if (a) { ctx.beginPath(); ctx.arc(x(a.born), y(a.perf), 5, 0, Math.PI * 2); ctx.fillStyle = theme.text; ctx.fill(); ctx.strokeStyle = theme.surface; ctx.lineWidth = 2; ctx.stroke(); }
    }
    if (hover) { ctx.beginPath(); ctx.arc(x(hover.gen), y(hover.perf), 6, 0, Math.PI * 2); ctx.strokeStyle = theme.text; ctx.lineWidth = 1.5; ctx.stroke(); }
  }, [version, theme, hover, selectedId, lineage, gmax, y0, y1]);

  const nearest = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const x = linear(-0.5, gmax + 0.5, PAD.l, geom.current.w - PAD.r), y = linear(y0, y1, H - PAD.b, PAD.t);
    const g0 = Math.round(x.invert(mx));
    let best: { id: number; gen: number; perf: number } | null = null, bd = 150;
    for (let gi = Math.max(0, g0 - 2); gi <= Math.min(run.generations.length - 1, g0 + 2); gi++) {
      const g = run.generations[gi];
      for (let k = 0; k < g.perfs.length; k++) {
        const d = (x(g.gen) - mx) ** 2 + (y(g.perfs[k]) - my) ** 2;
        if (d < bd) { bd = d; best = { id: g.ids[k], gen: g.gen, perf: g.perfs[k] }; }
      }
    }
    return best ? { ...best, px: mx, py: my } : null;
  };

  return (
    <div>
      <div className="legend" style={{ marginBottom: 4 }}>
        <span className="chip"><span className="swatch" style={{ background: theme.mutedMark }} />individual (per generation alive)</span>
        <span className="chip"><span className="swatch" style={{ background: theme.series[0] }} />lineage of selection</span>
        <span className="muted small">hover to inspect · click to load</span>
      </div>
      <div ref={boxRef} className="canvas-box">
        <canvas ref={canvasRef} style={{ cursor: 'pointer' }}
          onMouseMove={(e) => setHover(nearest(e))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => { const n = nearest(e); if (n) onSelect(n.id); }} />
        {hover && (() => {
          const a = run.archive.get(hover.id);
          return (
            <div className="tooltip num" style={{ left: Math.min(hover.px + 12, geom.current.w - 160), top: hover.py + 10 }}>
              #{hover.id} · in gen {hover.gen}<br />
              fitness {fmt(hover.perf, 4)}<br />
              {a && <>born gen {a.born}{a.parents.length ? ` from ${a.parents.map((p) => '#' + p).join(' × ')}` : ''}</>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/** Genome differences between pinned individuals, relative to the first, in search space. */
export function GenomeDiff({ items, labels }: { items: { label: string; color: string; rec: IndividualRecord }[]; labels: string[] }) {
  const theme = useTheme();
  if (items.length < 2) return <div className="muted small">Pin two or more evolved individuals to compare their genomes.</div>;
  const base = items[0].rec.genome;
  const cols = Math.min(labels.length, base.length);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data" style={{ width: 'auto' }}>
        <thead>
          <tr>
            <th></th>
            {Array.from({ length: cols }, (_, k) => <th key={k} style={{ padding: '2px 1px', fontSize: 10, writingMode: 'vertical-rl' }}>{labels[k]}</th>)}
          </tr>
        </thead>
        <tbody>
          {items.map((it, r) => (
            <tr key={it.label}>
              <td style={{ whiteSpace: 'nowrap' }}><span className="swatch" style={{ background: it.color, marginRight: 4 }} />{it.label}</td>
              {Array.from({ length: cols }, (_, k) => {
                const d = it.rec.genome[k] - base[k];
                return <td key={k} title={`${labels[k]}: ${fmt(it.rec.genome[k], 4)} (Δ ${fmt(d, 4)} vs ${items[0].label})`}
                  style={{ padding: 0, width: 14, height: 18, background: r === 0 ? theme.surface2 : divergingColor(theme, d / 0.5), borderBottom: 'none', border: `1px solid ${theme.surface}` }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legend small" style={{ marginTop: 4 }}>
        <span className="chip"><span className="swatch" style={{ background: divergingColor(theme, -1) }} />lower than {items[0].label}</span>
        <span className="chip"><span className="swatch" style={{ background: divergingColor(theme, 0) }} />same</span>
        <span className="chip"><span className="swatch" style={{ background: divergingColor(theme, 1) }} />higher (±0.5 in search space = full color)</span>
      </div>
    </div>
  );
}
