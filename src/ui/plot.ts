// Small plotting helpers shared by the canvas views.

export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  return Number(v.toFixed(digits)).toString();
}

export function extent(a: ArrayLike<number>, from = 0, to = a.length): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let i = from; i < to; i++) {
    const v = a[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

export function padExtent([lo, hi]: [number, number], frac = 0.06): [number, number] {
  const d = (hi - lo) * frac;
  return [lo - d, hi + d];
}

export interface Scale {
  (v: number): number;
  invert(p: number): number;
}

export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const s = ((v: number) => r0 + (v - d0) * k) as Scale;
  s.invert = (p: number) => d0 + (p - r0) / k;
  return s;
}

/** Draw a thin solid hairline axis with tick labels. */
export function drawXAxis(
  ctx: CanvasRenderingContext2D, x: Scale, y: number, x0: number, x1: number,
  ticks: number[], color: string, textColor: string, label?: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y + 0.5);
  ctx.lineTo(x1, y + 0.5);
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of ticks) ctx.fillText(fmt(t), x(t), y + 4);
  if (label) {
    ctx.textAlign = 'right';
    ctx.fillText(label, x1, y + 18);
  }
}

export function drawYTicks(
  ctx: CanvasRenderingContext2D, y: Scale, x: number, ticks: number[], gridColor: string,
  textColor: string, gx0: number, gx1: number,
) {
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of ticks) {
    const py = Math.round(y(t)) + 0.5;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx0, py);
    ctx.lineTo(gx1, py);
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.fillText(fmt(t), x, py);
  }
}

/** Contiguous [start, end) index runs where pred holds. */
export function runs(n: number, pred: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let s = -1;
  for (let i = 0; i < n; i++) {
    if (pred(i)) { if (s < 0) s = i; }
    else if (s >= 0) { out.push([s, i]); s = -1; }
  }
  if (s >= 0) out.push([s, n]);
  return out;
}
