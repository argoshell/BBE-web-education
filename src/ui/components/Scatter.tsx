// A scatter plot of categorized points with a legend; categories can be toggled.

import { useState } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { drawXAxis, drawYTicks, extent, linear, niceTicks, padExtent } from '../plot';
import { useTheme, withAlpha } from '../theme';

export interface ScatterGroup {
  label: string;
  color: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
}

interface Props {
  groups: ScatterGroup[];
  xLabel: string;
  yLabel: string;
  height?: number;
  radius?: number;
}

const LEFT = 48, RIGHT = 10, TOP = 8, AXIS = 32;

export function Scatter({ groups, xLabel, yLabel, height = 300, radius = 2.2 }: Props) {
  const theme = useTheme();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const shown = groups.filter((g) => !hidden.has(g.label));
  const all = (k: 'x' | 'y') => Float64Array.from(shown.flatMap((g) => Array.from(g[k])));
  const xs = all('x'), ys = all('y');

  const { boxRef, canvasRef } = useCanvas(height, (ctx, w) => {
    const [x0, x1] = xs.length ? padExtent(extent(xs)) : [0, 1];
    const [y0, y1] = ys.length ? padExtent(extent(ys)) : [0, 1];
    const x = linear(x0, x1, LEFT, w - RIGHT), y = linear(y0, y1, height - AXIS, TOP);
    drawYTicks(ctx, y, LEFT - 4, niceTicks(y0, y1, 5), theme.grid, theme.muted, LEFT, w - RIGHT);
    drawXAxis(ctx, x, height - AXIS, LEFT, w - RIGHT, niceTicks(x0, x1, 6), theme.axis, theme.muted, xLabel);
    for (const g of shown) {
      ctx.fillStyle = withAlpha(g.color, 0.7);
      for (let i = 0; i < g.x.length; i++) {
        ctx.beginPath();
        ctx.arc(x(g.x[i]), y(g.y[i]), radius, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(10, (height - AXIS) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = theme.muted;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }, [groups, hidden, theme, height]);

  return (
    <div>
      <div className="inline small" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
        {groups.map((g) => (
          <label key={g.label} className="chip" style={{ opacity: hidden.has(g.label) ? 0.5 : 1 }}>
            <input type="checkbox" checked={!hidden.has(g.label)} onChange={() => {
              const h = new Set(hidden);
              if (h.has(g.label)) h.delete(g.label); else h.add(g.label);
              setHidden(h);
            }} />
            <span className="swatch" style={{ background: g.color }} />{g.label}
          </label>
        ))}
      </div>
      <div ref={boxRef}><canvas ref={canvasRef} /></div>
    </div>
  );
}
