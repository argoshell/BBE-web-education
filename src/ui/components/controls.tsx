// Basic form controls: slider + number fields, selects.

import { useEffect, useState } from 'react';

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  title?: string;
  color?: string;
}

/** A labelled range slider with a synchronized number input (accepts values outside the slider range). */
export function NumberField({ label, value, min, max, step = 0.01, onChange, title, color }: NumberFieldProps) {
  const [text, setText] = useState(String(round(value)));
  useEffect(() => setText(String(round(value))), [value]);
  return (
    <div className="field" title={title}>
      <label>
        {color && <span className="swatch" style={{ background: color, marginRight: 4 }} />}
        {label}
      </label>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" step={step} value={text} className="num"
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) onChange(v);
        }} />
    </div>
  );
}

function round(v: number): number {
  return Math.abs(v) >= 1000 ? Math.round(v) : Number(v.toPrecision(6));
}

export function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="field" style={{ gridTemplateColumns: '74px minmax(0, 1fr)' }}>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function IntField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="field" style={{ gridTemplateColumns: '74px minmax(0, 1fr)' }}>
      <label>{label}</label>
      <input type="number" min={min} max={max} step={1} value={value} className="num"
        onChange={(e) => { const v = Math.round(Number(e.target.value)); if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v))); }} />
    </div>
  );
}

export function CheckField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="chip" style={{ fontSize: 12 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
