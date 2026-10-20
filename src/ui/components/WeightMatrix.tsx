// Editable connection-weight heatmap. Rows = from, columns = to. Drag a cell up/down
// to change its weight, or click to select it and edit the value precisely.

import { useRef, useState } from 'react';
import { divergingColor, neuronColor, useTheme } from '../theme';
import { NumberField } from './controls';

interface Props {
  size: number;
  weights: number[];
  range: number;
  onChange: (weights: number[]) => void;
}

export function WeightMatrix({ size, weights, range, onChange }: Props) {
  const theme = useTheme();
  const [sel, setSel] = useState<number | null>(null);
  const drag = useRef<{ k: number; y: number; w0: number; moved: boolean } | null>(null);

  const set = (k: number, v: number) => {
    const w = weights.slice();
    w[k] = v;
    onChange(w);
  };

  return (
    <div>
      <div className="matrix" style={{ gridTemplateColumns: `22px repeat(${size}, minmax(0, 44px))` }}>
        <div className="hdr" title="from \ to">↓→</div>
        {Array.from({ length: size }, (_, j) => (
          <div key={j} className="hdr" style={{ color: neuronColor(theme, j + 1) }}>{j + 1}</div>
        ))}
        {Array.from({ length: size }, (_, i) => [
          <div key={`h${i}`} className="hdr" style={{ color: neuronColor(theme, i + 1) }}>{i + 1}</div>,
          ...Array.from({ length: size }, (_, j) => {
            const k = i * size + j, v = weights[k];
            return (
              <div key={k} className={`cell num${sel === k ? ' sel' : ''}`}
                style={{ background: divergingColor(theme, v / range) }}
                title={`w ${i + 1}→${j + 1} = ${v.toFixed(3)}`}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { k, y: e.clientY, w0: v, moved: false };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.k !== k) return;
                  const dy = d.y - e.clientY;
                  if (Math.abs(dy) > 2) d.moved = true;
                  if (d.moved) set(k, Math.round((d.w0 + (dy * range) / 100) * 100) / 100);
                }}
                onPointerUp={() => {
                  if (drag.current && !drag.current.moved) setSel(sel === k ? null : k);
                  drag.current = null;
                }}
              >
                {size <= 6 ? (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)) : ''}
              </div>
            );
          }),
        ])}
      </div>
      <div className="legend small" style={{ marginTop: 4 }}>
        <span className="chip"><span className="swatch" style={{ background: divergingColor(theme, -1) }} />−{range}</span>
        <span className="chip"><span className="swatch" style={{ background: divergingColor(theme, 0) }} />0</span>
        <span className="chip"><span className="swatch" style={{ background: divergingColor(theme, 1) }} />+{range}</span>
        <span className="muted">drag a cell ↕ · click to edit</span>
      </div>
      {sel !== null && sel < weights.length && (
        <div style={{ marginTop: 6 }}>
          <NumberField label={`w ${Math.floor(sel / size) + 1}→${(sel % size) + 1}`} value={weights[sel]}
            min={-range} max={range} step={0.01} onChange={(v) => set(sel, v)} />
        </div>
      )}
    </div>
  );
}
