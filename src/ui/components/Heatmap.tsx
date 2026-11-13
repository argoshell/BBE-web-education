// A sequential heatmap over a regular 2-D grid (rows bottom-to-top), with axes, hover readout
// and an optional marked cell.

import { useRef, useState } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, drawYTicks, fmt, linear, niceTicks } from '../plot';
import { useTheme, type Theme } from '../theme';

/** Sequential ramp from the surface color to a deep blue (light) or a pale blue (dark). */
function sequentialColor(theme: Theme, t: number): string {
  const surfaceIsDark = parseInt(theme.surface.replace('#', '').slice(0, 2), 16) < 128;
  const lo = surfaceIsDark ? [26, 26, 25] : [252, 252, 251], hi = surfaceIsDark ? [158, 197, 244] : [13, 54, 107];
  const c = lo.map((v, k) => Math.round(v + (hi[k] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

interface Props {
  /** values[row][col]; row 0 is drawn at the bottom. */
  values: ArrayLike<number>[];
  xRange: [number, number];
  yRange: [number, number];
  vRange?: [number, number];
  xLabel: string;
  yLabel: string;
  valueLabel: string;
  height?: number;
  /** Cell to outline, in data coordinates. */
  mark?: [number, number];
  onClick?: (x: number, y: number) => void;
}

const LEFT = 44, RIGHT = 10, TOP = 6, AXIS = 32;

export function Heatmap({ values, xRange, yRange, vRange = [0, 1], xLabel, yLabel, valueLabel, height = 260, mark, onClick }: Props) {
  const theme = useTheme();
  const [hover, setHover] = useState<{ r: number; c: number; px: number; py: number } | null>(null);
  const geom = useRef({ w: 0 });
  const rows = values.length, cols = values[0]?.length ?? 0;
  const cellAt = (w: number) => ({ cw: (w - LEFT - RIGHT) / cols, ch: (height - TOP - AXIS) / rows });

  const { boxRef, canvasRef } = useCanvas(height, (ctx, w) => {
    geom.current.w = w;
    const { cw, ch } = cellAt(w);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = sequentialColor(theme, (values[r][c] - vRange[0]) / (vRange[1] - vRange[0]));
        ctx.fillRect(LEFT + c * cw, height - AXIS - (r + 1) * ch, Math.ceil(cw), Math.ceil(ch));
      }
    const xs = linear(xRange[0], xRange[1], LEFT + cw / 2, w - RIGHT - cw / 2);
    const ys = linear(yRange[0], yRange[1], height - AXIS - ch / 2, TOP + ch / 2);
    if (mark) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(xs(mark[0]) - cw / 2, ys(mark[1]) - ch / 2, cw, ch);
    }
    drawXAxis(ctx, xs, height - AXIS + 2, LEFT, w - RIGHT, niceTicks(xRange[0], xRange[1], 6), theme.axis, theme.muted, xLabel);
    drawYTicks(ctx, ys, LEFT - 4, niceTicks(yRange[0], yRange[1], 5), 'transparent', theme.muted, LEFT, LEFT);
    ctx.save();
    ctx.translate(10, (height - AXIS) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = theme.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }, [values, theme, mark, height, xRange[0], xRange[1], yRange[0], yRange[1]]);

  const locate = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const { cw, ch } = cellAt(geom.current.w);
    const c = Math.floor((px - LEFT) / cw), r = Math.floor((height - AXIS - py) / ch);
    return c >= 0 && c < cols && r >= 0 && r < rows ? { r, c, px, py } : null;
  };
  const dataAt = (r: number, c: number): [number, number] => [
    xRange[0] + (cols > 1 ? ((xRange[1] - xRange[0]) * c) / (cols - 1) : 0),
    yRange[0] + (rows > 1 ? ((yRange[1] - yRange[0]) * r) / (rows - 1) : 0),
  ];

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <canvas ref={canvasRef} style={{ cursor: onClick ? 'pointer' : 'default' }}
        onMouseMove={(e) => setHover(locate(e))} onMouseLeave={() => setHover(null)}
        onClick={(e) => { const h = locate(e); if (h && onClick) onClick(...dataAt(h.r, h.c)); }} />
      {hover && (
        <div className="tooltip" style={{ left: hover.px + 12, top: hover.py + 12 }}>
          {xLabel} {fmt(dataAt(hover.r, hover.c)[0], 2)} · {yLabel} {fmt(dataAt(hover.r, hover.c)[1], 2)}<br />
          {valueLabel} <b className="num">{fmt(values[hover.r][hover.c], 3)}</b>
        </div>
      )}
    </div>
  );
}
