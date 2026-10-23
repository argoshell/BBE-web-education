// Information lens over a trial ensemble (Williams & Beer 2010; Beer & Williams 2015):
//  - heatmap: how much each channel (neuron, or a body-environment variable) tells about a
//    stimulus variable at each moment, I(S; X(t)), as a fraction of H(S)
//  - detail for two channels: I(S; A) and I(S; B) against a shuffle (chance) level,
//    specific information for each stimulus value, and the partial information decomposition
//    of I(S; A, B) into redundant, unique and synergistic parts.

import { useMemo, useRef, useState } from 'react';
import { detailOverTime, infoOverTime, type Binning, type Ensemble } from '../../sim/analysis/information';
import { LineChart } from '../components/LineChart';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, fmt, linear, niceTicks } from '../plot';
import { useTheme, type Theme } from '../theme';

function ramp(theme: Theme, t: number): string {
  const light = [252, 252, 251], dark = [13, 54, 107];
  const surfaceIsDark = parseInt(theme.surface.replace('#', '').slice(0, 2), 16) < 128;
  const lo = surfaceIsDark ? [26, 26, 25] : light, hi = surfaceIsDark ? [158, 197, 244] : dark;
  const c = lo.map((v, k) => Math.round(v + (hi[k] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const LEFT = 92, RIGHT = 12, AXIS = 30;

interface Props {
  ensemble: Ensemble;
  /** Color of a channel's identity (neuron color), or undefined for ink. */
  colorOf: (key: string) => string | undefined;
  /** Current time of the single-trial explorer, drawn as a marker. */
  time?: number;
  onSeekTime?: (t: number) => void;
  /** Initial channels for the detail charts. */
  defaultPair?: [string, string];
}

export function InfoPanel({ ensemble, colorOf, time, onSeekTime, defaultPair }: Props) {
  const theme = useTheme();
  const [stim, setStim] = useState(0);
  const [bins, setBins] = useState(8);
  const [binning, setBinning] = useState<Binning>('width');
  const keys = ensemble.channels.map((c) => c.key);
  const [aKey, setA] = useState(defaultPair?.[0] ?? keys[1] ?? keys[0]);
  const [bKey, setB] = useState(defaultPair?.[1] ?? keys[2] ?? keys[0]);
  const a = Math.max(0, keys.indexOf(aKey)), b = Math.max(0, keys.indexOf(bKey));
  const stride = Math.max(1, Math.round(ensemble.t.length / 300));
  const opts = useMemo(() => ({ bins, binning, stride }), [bins, binning, stride]);
  const st = ensemble.stimuli[Math.min(stim, ensemble.stimuli.length - 1)];

  const over = useMemo(() => infoOverTime(ensemble, stim, opts), [ensemble, stim, opts]);
  const detail = useMemo(() => detailOverTime(ensemble, stim, a, b, opts), [ensemble, stim, a, b, opts]);
  const [hover, setHover] = useState<{ row: number; col: number; px: number; py: number } | null>(null);
  const geom = useRef({ w: 0 });
  const rowH = 16;
  const H = ensemble.channels.length * rowH + AXIS;

  const { boxRef, canvasRef, width } = useCanvas(H, (ctx, w) => {
    geom.current.w = w;
    const cols = over.t.length;
    const cw = (w - LEFT - RIGHT) / cols;
    over.mi.forEach((row, r) => {
      const top = r * rowH;
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = ramp(theme, over.hS > 0 ? row[c] / over.hS : 0);
        ctx.fillRect(LEFT + c * cw, top, cw + 0.6, rowH - 1);
      }
      const ch = ensemble.channels[r];
      const color = colorOf(ch.key);
      ctx.fillStyle = color ?? theme.text2;
      ctx.fillRect(4, top + 4, 8, 8);
      ctx.fillStyle = r === a || r === b ? theme.text : theme.text2;
      ctx.font = `${r === a || r === b ? '600 ' : ''}11px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch.label, 16, top + rowH / 2);
    });
    const x = linear(over.t[0], over.t[cols - 1], LEFT, w - RIGHT);
    drawXAxis(ctx, x, H - AXIS + 2, LEFT, w - RIGHT, niceTicks(over.t[0], over.t[cols - 1], 8), theme.axis, theme.muted, 'time');
    if (time !== undefined) {
      ctx.strokeStyle = theme.series[1];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.round(x(time)) + 0.5, 0);
      ctx.lineTo(Math.round(x(time)) + 0.5, H - AXIS);
      ctx.stroke();
    }
  }, [over, theme, time, a, b, ensemble, colorOf]);

  const cellAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const row = Math.floor(py / rowH);
    const col = Math.floor(((px - LEFT) / (geom.current.w - LEFT - RIGHT)) * over.t.length);
    return row >= 0 && row < ensemble.channels.length && col >= 0 && col < over.t.length ? { row, col, px, py } : null;
  };

  const colorA = colorOf(keys[a]) ?? theme.text, colorB0 = colorOf(keys[b]) ?? theme.text;
  // Ink-colored channels get dash patterns so they never look like the (solid ink) redundancy line
  const dashA = colorA === theme.text ? [8, 3] : undefined;
  const dashB = colorB0 === theme.text || colorB0 === colorA ? [3, 3] : undefined;
  const catStyles = [{ c: theme.text }, { c: theme.text, d: [5, 3] }, { c: theme.muted }, { c: theme.muted, d: [5, 3] }];
  const chanSelect = (v: string, on: (k: string) => void) => (
    <select value={v} onChange={(e) => on(e.target.value)}>{ensemble.channels.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
  );
  const hm = hover ? over.mi[hover.row][hover.col] : 0;

  return (
    <div>
      <div className="inline small" style={{ marginBottom: 8 }}>
        <span className="muted">information about</span>
        <select value={stim} onChange={(e) => setStim(Number(e.target.value))}>
          {ensemble.stimuli.map((s, i) => <option key={s.key} value={i}>{s.label}</option>)}
        </select>
        <span className="muted">bins</span>
        <select value={bins} onChange={(e) => setBins(Number(e.target.value))}>{[2, 4, 8, 16].map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <select value={binning} onChange={(e) => setBinning(e.target.value as Binning)}>
          <option value="width">equal-width bins</option>
          <option value="quantile">equal-count bins</option>
        </select>
        <span className="muted">{ensemble.trials} trials · H(S) = {fmt(over.hS, 3)} bits</span>
      </div>

      <div className="legend" style={{ marginBottom: 4 }}>
        <span className="chip"><span className="swatch" style={{ width: 40, background: `linear-gradient(90deg, ${ramp(theme, 0)}, ${ramp(theme, 1)})`, border: `1px solid ${theme.axis}` }} />
          I(S; X(t)) from 0 to H(S) = all there is to know</span>
        {time !== undefined && <span className="chip"><span className="swatch" style={{ background: theme.series[1] }} />current time</span>}
        <span className="muted small">click a row to select it as A (shift-click: B)</span>
      </div>
      <div ref={boxRef} className="canvas-box">
        <canvas ref={canvasRef} style={{ cursor: 'pointer' }}
          onMouseMove={(e) => setHover(cellAt(e))} onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const c = cellAt(e);
            if (!c) return;
            if (e.shiftKey) setB(keys[c.row]); else setA(keys[c.row]);
            onSeekTime?.(over.t[c.col]);
          }} />
        {hover && (
          <div className="tooltip num" style={{ left: Math.min(hover.px + 12, width - 220), top: hover.py + 12 }}>
            {ensemble.channels[hover.row].label} at t = {fmt(over.t[hover.col], 1)}<br />
            I(S; X) = {fmt(hm, 3)} bits ({fmt((100 * hm) / Math.max(over.hS, 1e-12), 0)}% of H(S))
          </div>
        )}
      </div>

      <div className="inline small" style={{ margin: '12px 0 6px' }}>
        <span className="muted">A</span>{chanSelect(keys[a], setA)}
        <span className="muted">B</span>{chanSelect(keys[b], setB)}
      </div>
      <div className="row-2" style={{ gap: 16 }}>
        <div>
          <h3 style={{ marginBottom: 4 }}>Information about {st.key} in A and B</h3>
          <LineChart x={detail.t} xLabel="time" yLabel="bits" marker={time} onClickX={onSeekTime}
            yRange={[0, Math.max(over.hS, 0.05) * 1.05]}
            series={[
              { label: `A: ${ensemble.channels[a].label}`, values: over.mi[a], color: colorA, dash: dashA },
              { label: `B: ${ensemble.channels[b].label}`, values: over.mi[b], color: colorB0, dash: dashB },
            ]}
            band={{ label: 'chance level for A (95% of shuffles)', values: detail.baseline }} />
        </div>
        <div>
          <h3 style={{ marginBottom: 4 }}>Specific information in A, per {st.key}</h3>
          <LineChart x={detail.t} xLabel="time" yLabel="bits" marker={time} onClickX={onSeekTime}
            series={st.categories.map((cat, k) => ({ label: `I(S = ${cat}; A)`, values: detail.specific[k], color: catStyles[k % 4].c, dash: catStyles[k % 4].d }))} />
        </div>
      </div>
      <h3 style={{ margin: '12px 0 4px' }}>How A and B share information about {st.key} (partial information decomposition)</h3>
      <LineChart x={detail.t} xLabel="time" yLabel="bits" marker={time} onClickX={onSeekTime} height={180}
        series={[
          { label: 'redundant (both carry it)', values: detail.pid.redundancy, color: theme.text, width: 2.5 },
          { label: `unique to A`, values: detail.pid.uniqueA, color: colorA, dash: dashA },
          { label: `unique to B`, values: detail.pid.uniqueB, color: colorB0, dash: dashB },
          { label: 'synergistic (only together)', values: detail.pid.synergy, color: theme.muted, dash: [2, 3] },
        ]} />
      <p className="small muted" style={{ marginTop: 6 }}>
        Estimates use plug-in probabilities from {ensemble.trials} trials, so small values are inflated by sampling bias. Compare against the
        shaded chance level, and try fewer bins or more trials. Specific information I(S = s; A) says how much observing A
        tells about one stimulus value; the decomposition uses Williams &amp; Beer&apos;s (2010) I<sub>min</sub> redundancy.
      </p>
    </div>
  );
}
