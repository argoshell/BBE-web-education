// Dynamica-style analysis of a CTRNN with its inputs frozen at the current moment:
// equilibria (stability, type, eigenvalues), the limit cycle reached from the current state
// (period, Floquet multipliers), and a one-parameter bifurcation diagram with fold and Hopf points.

import { useDeferredValue, useMemo, useRef, useState } from 'react';
import {
  equilibriumBranches, equilibriumPoints, findLimitCycle, type Branch, type ParamFamily,
} from '../../sim/analysis/dynamics';
import { cycleBranches, type CycleBranch } from '../../sim/analysis/cycles';
import type { Complex } from '../../sim/analysis/linalg';
import type { CTRNNParams } from '../../sim/core/ctrnn';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, drawYTicks, fmt, linear, niceTicks } from '../plot';
import { useTheme } from '../theme';

export interface FamilyOption {
  key: string;
  label: string;
  /** Current value of the parameter. */
  value: number;
  /** Default range to scan. */
  range: [number, number];
  family: ParamFamily;
  /** Apply a value (clicking the diagram). Omit for parameters the user cannot set directly. */
  apply?: (v: number) => void;
}

interface Props {
  circuit: CTRNNParams;
  inputs: ArrayLike<number>;
  /** Current neural state, used as the starting point for the limit cycle search. */
  state: ArrayLike<number>;
  neuronName: (i: number) => string;
  neuronColor: (i: number) => string;
  families: FamilyOption[];
  /** Note shown above the analysis (e.g. what is frozen). */
  note?: string;
}

const fmtC = (c: Complex, d = 3) => (Math.abs(c.im) < 1e-9 ? fmt(c.re, d) : `${fmt(c.re, d)} ${c.im < 0 ? '−' : '+'} ${fmt(Math.abs(c.im), d)}i`);

export function DynamicsPanel({ circuit, inputs, state, neuronName, neuronColor, families, note }: Props) {
  const n = circuit.size;
  const deferredCircuit = useDeferredValue(circuit);
  const eps = useMemo(() => equilibriumPoints(deferredCircuit, inputs), [deferredCircuit, inputs]);
  const lc = useMemo(() => findLimitCycle(deferredCircuit, inputs, state), [deferredCircuit, inputs, state]);

  return (
    <div>
      {note && <p className="small muted" style={{ marginBottom: 6 }}>{note}</p>}
      <h3 style={{ marginBottom: 4 }}>Equilibrium points</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              {Array.from({ length: n }, (_, i) => <th key={i} className="num"><span className="swatch" style={{ background: neuronColor(i), marginRight: 4 }} />{neuronName(i)}</th>)}
              <th>stability</th><th>type</th><th>eigenvalues</th>
            </tr>
          </thead>
          <tbody>
            {eps.map((e, k) => (
              <tr key={k}>
                <td className="num">{k + 1}</td>
                {Array.from(e.outputs, (o, i) => <td key={i} className="num">{fmt(o, 3)}</td>)}
                <td>{e.stability}</td>
                <td>{e.type}</td>
                <td className="num small">{e.eigenvalues.map((v) => fmtC(v)).join(',  ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 2 }}>Neuron outputs at each equilibrium. Classification as in Dynamica: stable / unstable / saddle / nonhyperbolic from the real parts of the eigenvalues; node / spiral / mixed from their imaginary parts.</p>

      <h3 style={{ margin: '10px 0 4px' }}>Limit cycle from the current state</h3>
      {lc ? (
        <p className="small">
          <b>{lc.stable ? 'Stable' : 'Unstable'} limit cycle</b>, period <b className="num">{fmt(lc.period, 4)}</b>.
          Floquet multipliers: <span className="num">{lc.multipliers.map((m) => fmtC(m, 4)).join(',  ')}</span>
          <span className="muted"> (one is always ≈ 1, along the cycle; the cycle is stable when the others lie inside the unit circle).</span>
        </p>
      ) : (
        <p className="small muted">No limit cycle: from the current state the flow settles to an equilibrium (or the search did not converge).</p>
      )}

      <h3 style={{ margin: '10px 0 4px' }}>Bifurcation diagram</h3>
      {families.length > 0 ? <BifurcationDiagram families={families} neuronName={neuronName} neuronColor={neuronColor} state={state} n={n} key={families.map((f) => f.key).join()} /> : <p className="small muted">No parameters to vary.</p>}
      <p className="small muted" style={{ marginTop: 4 }}>
        Analyses reimplemented after the capabilities of Beer&apos;s Dynamica package for Mathematica: Newton&apos;s method for equilibria, Newton shooting
        for limit cycles, pseudo-arclength continuation for branches. Inputs to the circuit are held at their current values.
      </p>
    </div>
  );
}

const PAD = { l: 46, r: 12, t: 10, b: 34 };

function BifurcationDiagram({ families, neuronName, neuronColor, state, n }: {
  families: FamilyOption[]; neuronName: (i: number) => string; neuronColor: (i: number) => string; state: ArrayLike<number>; n: number;
}) {
  const theme = useTheme();
  const [fk, setFk] = useState(families[0].key);
  const fam = families.find((f) => f.key === fk) ?? families[0];
  const [range, setRange] = useState<[number, number]>(fam.range);
  const [neuron, setNeuron] = useState(0);
  const [showCycles, setShowCycles] = useState(false);
  const [hover, setHover] = useState<{ px: number; py: number; l: number } | null>(null);
  const geom = useRef({ w: 0, h: 0 });
  const k = Math.min(neuron, n - 1);

  // Recompute when the family's circuit changes (deferred so dragging stays responsive)
  const deferredFam = useDeferredValue(fam);
  const branches: Branch[] = useMemo(() => {
    try { return equilibriumBranches(deferredFam.family, range[0], range[1]); } catch { return []; }
  }, [deferredFam, range]);
  // Limit-cycle branches by continuation (on request: slower)
  const cycles: CycleBranch[] = useMemo(() => {
    if (!showCycles) return [];
    try { return cycleBranches(deferredFam.family, range[0], range[1], branches, state); } catch { return []; }
  }, [showCycles, deferredFam, range, branches, state]);
  // Simulated attractor envelope: min / max of the output after a transient, from the current state
  const envelope = useMemo(() => {
    if (showCycles) return [];
    const out: { l: number; lo: number; hi: number }[] = [];
    const S = 40;
    for (let s = 0; s <= S; s++) {
      const l = range[0] + ((range[1] - range[0]) * s) / S;
      const c = deferredFam.family.circuit(l), I = deferredFam.family.inputs(l);
      const lc = findLimitCycle(c, I, state, { settle: 100, maxPeriod: 200, h: Math.min(0.05, Math.min(...c.taus) / 20) });
      if (lc) {
        let lo = 1, hi = 0;
        for (const y of lc.trajectory) {
          const o = 1 / (1 + Math.exp(-c.gains[k] * (y[k] + c.biases[k])));
          lo = Math.min(lo, o); hi = Math.max(hi, o);
        }
        if (hi - lo > 1e-3) out.push({ l, lo, hi });
      }
    }
    return out;
  }, [deferredFam, range, state, k, showCycles]);

  const H = 300;
  const { boxRef, canvasRef, width } = useCanvas(H, (ctx, w, h) => {
    geom.current = { w, h };
    const x = linear(range[0], range[1], PAD.l, w - PAD.r), y = linear(-0.03, 1.03, h - PAD.b, PAD.t);
    drawYTicks(ctx, y, PAD.l - 6, [0, 0.25, 0.5, 0.75, 1], theme.grid, theme.muted, PAD.l, w - PAD.r);
    drawXAxis(ctx, x, h - PAD.b, PAD.l, w - PAD.r, niceTicks(range[0], range[1], 7), theme.axis, theme.muted, fam.label);
    // Oscillation envelope
    ctx.fillStyle = neuronColor(k);
    for (const e of envelope) for (const v of [e.lo, e.hi]) { ctx.beginPath(); ctx.arc(x(e.l), y(v), 2.5, 0, Math.PI * 2); ctx.fill(); }
    // Limit-cycle branches: max and min of the output around the cycle
    for (const cb of cycles) {
      for (const which of ['max', 'min'] as const) {
        let i = 1;
        while (i < cb.points.length) {
          const stable = cb.points[i - 1].stable && cb.points[i].stable;
          ctx.strokeStyle = neuronColor(k);
          ctx.lineWidth = stable ? 2.2 : 1.4;
          ctx.setLineDash(stable ? [] : [5, 4]);
          ctx.beginPath();
          ctx.moveTo(x(cb.points[i - 1].lambda), y(cb.points[i - 1][which][k]));
          while (i < cb.points.length && (cb.points[i - 1].stable && cb.points[i].stable) === stable) {
            ctx.lineTo(x(cb.points[i].lambda), y(cb.points[i][which][k]));
            i++;
          }
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      for (const bp of cb.bifurcations) {
        const p = cb.points.reduce((m, q) => (Math.abs(q.lambda - bp.lambda) < Math.abs(m.lambda - bp.lambda) ? q : m));
        for (const v of [p.max[k], p.min[k]]) {
          ctx.beginPath();
          ctx.moveTo(x(bp.lambda), y(v) - 6); ctx.lineTo(x(bp.lambda) + 6, y(v) + 5); ctx.lineTo(x(bp.lambda) - 6, y(v) + 5); ctx.closePath();
          ctx.fillStyle = theme.surface; ctx.fill();
          ctx.strokeStyle = theme.text; ctx.lineWidth = 1.5; ctx.stroke();
        }
      }
    }
    // Equilibrium branches
    // Draw each run of equal stability as one path so dash patterns stay continuous
    for (const b of branches) {
      let i = 1;
      while (i < b.points.length) {
        const stable = b.points[i - 1].stability === 'stable' && b.points[i].stability === 'stable';
        ctx.strokeStyle = stable ? theme.text : theme.muted;
        ctx.lineWidth = stable ? 2.2 : 1.4;
        ctx.setLineDash(stable ? [] : [5, 4]);
        ctx.beginPath();
        ctx.moveTo(x(b.points[i - 1].lambda), y(b.points[i - 1].outputs[k]));
        while (i < b.points.length && (b.points[i - 1].stability === 'stable' && b.points[i].stability === 'stable') === stable) {
          ctx.lineTo(x(b.points[i].lambda), y(b.points[i].outputs[k]));
          i++;
        }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // Bifurcation points
    for (const b of branches)
      for (const bp of b.bifurcations) {
        const px = x(bp.lambda), py = y(bp.outputs[k]);
        ctx.fillStyle = theme.surface;
        ctx.strokeStyle = theme.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (bp.kind === 'fold') ctx.rect(px - 4.5, py - 4.5, 9, 9);
        else { ctx.moveTo(px, py - 6); ctx.lineTo(px + 6, py); ctx.lineTo(px, py + 6); ctx.lineTo(px - 6, py); ctx.closePath(); }
        ctx.fill();
        ctx.stroke();
      }
    // Current value
    if (fam.value >= range[0] && fam.value <= range[1]) {
      ctx.strokeStyle = theme.series[1];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.round(x(fam.value)) + 0.5, PAD.t);
      ctx.lineTo(Math.round(x(fam.value)) + 0.5, h - PAD.b);
      ctx.stroke();
    }
    if (hover) {
      ctx.strokeStyle = theme.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(hover.px) + 0.5, PAD.t);
      ctx.lineTo(Math.round(hover.px) + 0.5, h - PAD.b);
      ctx.stroke();
    }
  }, [branches, cycles, envelope, range, k, theme, fam.value, fam.label, hover, neuronColor]);

  const valueAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const x = linear(range[0], range[1], PAD.l, geom.current.w - PAD.r);
    return { px, py, l: x.invert(px) };
  };
  const bifs = branches.flatMap((b) => b.bifurcations).sort((a, b) => a.lambda - b.lambda);
  const cycleBifs = cycles.flatMap((c) => c.bifurcations);
  const cycleName = { lpc: 'fold of cycles', pd: 'period doubling', ns: 'torus (Neimark–Sacker)' };

  return (
    <div>
      <div className="inline small" style={{ marginBottom: 6 }}>
        <span className="muted">vary</span>
        <select value={fam.key} onChange={(e) => { const f = families.find((q) => q.key === e.target.value)!; setFk(f.key); setRange(f.range); }}>
          {families.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <input type="number" className="num" style={{ width: 64 }} value={range[0]} step={0.5} onChange={(e) => setRange([Number(e.target.value), range[1]])} />
        <input type="number" className="num" style={{ width: 64 }} value={range[1]} step={0.5} onChange={(e) => setRange([range[0], Number(e.target.value)])} />
        <span className="muted">show</span>
        <select value={k} onChange={(e) => setNeuron(Number(e.target.value))}>{Array.from({ length: n }, (_, i) => <option key={i} value={i}>{neuronName(i)} output</option>)}</select>
        <label className="chip"><input type="checkbox" checked={showCycles} onChange={(e) => setShowCycles(e.target.checked)} />follow limit-cycle branches (slower)</label>
      </div>
      <div className="legend" style={{ marginBottom: 4 }}>
        <span className="chip"><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke={theme.text} strokeWidth="2.2" /></svg>stable equilibria</span>
        <span className="chip"><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke={theme.muted} strokeWidth="1.4" strokeDasharray="5 4" /></svg>unstable</span>
        <span className="chip">□ fold (saddle-node) · ◇ Hopf</span>
        {showCycles
          ? <span className="chip"><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke={neuronColor(k)} strokeWidth="2.2" /></svg>limit cycle max / min (dashed: unstable) · △ cycle bifurcation</span>
          : <span className="chip"><span className="swatch" style={{ background: neuronColor(k), borderRadius: 5 }} />simulated limit-cycle min / max</span>}
        <span className="chip"><span className="swatch" style={{ background: theme.series[1] }} />current value</span>
      </div>
      <div ref={boxRef} className="canvas-box">
        <canvas ref={canvasRef} style={{ cursor: fam.apply ? 'pointer' : 'crosshair' }}
          onMouseMove={(e) => setHover(valueAt(e))} onMouseLeave={() => setHover(null)}
          onClick={(e) => fam.apply?.(Number(valueAt(e).l.toFixed(3)))} />
        {hover && (
          <div className="tooltip num" style={{ left: Math.min(hover.px + 12, width - 160), top: 8 }}>
            {fam.label} = {fmt(hover.l, 3)}{fam.apply ? <><br /><span className="muted">click to set</span></> : null}
          </div>
        )}
      </div>
      {(bifs.length > 0 || cycleBifs.length > 0) && (
        <p className="small" style={{ marginTop: 4 }}>
          {bifs.map((b, i) => <span key={i} className="num" style={{ marginRight: 12 }}>{b.kind === 'fold' ? '□ fold' : '◇ Hopf'} at {fmt(b.lambda, 3)}</span>)}
          {cycleBifs.map((b, i) => <span key={'c' + i} className="num" style={{ marginRight: 12 }}>△ {cycleName[b.kind]} at {fmt(b.lambda, 3)} (period {fmt(b.period, 2)})</span>)}
        </p>
      )}
    </div>
  );
}

/** Collapsible card that runs the analysis only when opened. */
export function DynamicsCard(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Dynamics</h2>
        <span className="muted small">equilibria, limit cycles and bifurcations, in the spirit of Beer&apos;s Dynamica</span>
        <div className="spacer" />
        <button className="btn small" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Analyze'}</button>
      </div>
      {open ? <DynamicsPanel {...props} /> : (
        <p className="small muted">
          Finds every equilibrium of the circuit with its eigenvalues, stability and type; the limit cycle reached from the current state with its
          period and Floquet multipliers; and a bifurcation diagram over any parameter, marking folds and Hopf bifurcations.
        </p>
      )}
    </div>
  );
}

