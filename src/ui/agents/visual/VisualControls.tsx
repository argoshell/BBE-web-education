// Sidebar controls and evolution genome settings for the visual categorizer.

import { useRef } from 'react';
import { formatNs, parseNs } from '../../../sim/core/ctrnn';
import { genes, INTER, MOTORS, N, neuronName, SENSORS, visualAgent, type VisualEvoConfig, type VisualState } from '../../../sim/agents/visual';
import { CheckField, IntField, NumberField, SelectField } from '../../components/controls';
import { WeightMatrix } from '../../components/WeightMatrix';
import { neuronColor, useTheme } from '../../theme';

interface Props {
  state: VisualState;
  onChange: (s: VisualState) => void;
  onPreset: (s: VisualState) => void;
}

export function VisualControls({ state, onChange, onPreset }: Props) {
  const theme = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const c = state.circuit;
  const setArr = (key: 'taus' | 'biases' | 'gains', ids: number[], v: number) => {
    const a = c[key].slice();
    for (const i of ids) a[i] = v;
    onChange({ ...state, circuit: { ...c, [key]: a } });
  };
  const setTrial = (patch: Partial<VisualState['trial']>) => onChange({ ...state, trial: { ...state.trial, ...patch } });
  const setTrials = (patch: Partial<VisualState['trials']>) => onChange({ ...state, trials: { ...state.trials, ...patch } });
  const neuronBlock = (label: string, ids: number[], color: string, withGain = false) => (
    <div key={label} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="small secondary">{label}</div>
      <NumberField label="τ (tau)" value={c.taus[ids[0]]} min={0.5} max={5} step={0.01} onChange={(v) => setArr('taus', ids, Math.max(1e-3, v))} />
      <NumberField label="θ (bias)" value={c.biases[ids[0]]} min={-10} max={10} step={0.01} onChange={(v) => setArr('biases', ids, v)} />
      {withGain && <NumberField label="gain" value={c.gains[ids[0]]} min={0.1} max={8} step={0.01} onChange={(v) => setArr('gains', ids, v)} />}
    </div>
  );

  return (
    <>
      <details className="section" open>
        <summary>Trial</summary>
        <div className="section-body">
          <SelectField label="preset" value="" onChange={(v) => { const p = visualAgent.presets[Number(v)]; if (p) onPreset(p.params()); }}
            options={[{ value: '', label: 'Load a preset…' }, ...visualAgent.presets.map((p, i) => ({ value: String(i), label: p.name }))]} />
          <SelectField label="object" value={state.trial.shape} onChange={(v) => setTrial({ shape: v })}
            options={[{ value: 'circle', label: 'Circle (catch)' }, { value: 'line', label: 'Line (avoid)' }]} />
          <NumberField label="start offset" value={state.trial.offset} min={-80} max={80} step={0.5} onChange={(v) => setTrial({ offset: v })}
            title="Object's initial horizontal position relative to the agent" />
          <NumberField label="fall speed" value={-state.trial.vy} min={0.5} max={8} step={0.1} onChange={(v) => setTrial({ vy: -Math.max(0.05, v) })} />
          <NumberField label="object size" value={state.trial.size} min={5} max={60} step={1} onChange={(v) => setTrial({ size: Math.max(1, v) })} />
        </div>
      </details>

      <details className="section">
        <summary>Trial set (overview &amp; fitness)</summary>
        <div className="section-body">
          <IntField label="per shape" value={state.trials.count} min={1} max={40} onChange={(v) => setTrials({ count: v })} />
          <NumberField label="offset range" value={state.trials.range} min={5} max={100} step={1} onChange={(v) => setTrials({ range: v })} />
          <NumberField label="max distance" value={state.maxDistance} min={5} max={100} step={1} onChange={(v) => onChange({ ...state, maxDistance: Math.max(1, v) })}
            title="Horizontal distances are clipped to this when scoring" />
          <button className="btn small" onClick={() => setTrials({ vy: state.trial.vy, size: state.trial.size })}>Use this trial's speed &amp; size</button>
        </div>
      </details>

      <details className="section" open>
        <summary>Neurons</summary>
        <div className="section-body">
          {neuronBlock('Sensory S1–S7 (shared)', SENSORS, theme.text2, true)}
          {INTER.map((i) => neuronBlock(`Interneuron ${neuronName(i)}`, [i], neuronColor(theme, i - 6)))}
          {MOTORS.map((i) => neuronBlock(`Motor ${neuronName(i)} (${i === 12 ? 'pushes right' : 'pushes left'})`, [i], neuronColor(theme, i - 6)))}
        </div>
      </details>

      <details className="section">
        <summary>Connection weights</summary>
        <div className="section-body">
          <p className="small muted">Rows: from S1–S7, N1–N5, M1–M2. Columns: to.</p>
          <WeightMatrix size={N} weights={c.weights} range={5} onChange={(weights) => onChange({ ...state, circuit: { ...c, weights } })} />
          <div className="inline">
            <button className="btn small" onClick={() => fileRef.current?.click()}>Load .ns…</button>
            <button className="btn small" onClick={() => {
              const blob = new Blob([formatNs(c)], { type: 'text/plain' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'categorize.ns';
              a.click();
              URL.revokeObjectURL(a.href);
            }}>Save .ns</button>
            <input ref={fileRef} type="file" accept=".ns,.txt" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const p = parseNs(await f.text());
                if (p.size !== N) throw new Error(`The visual agent needs a ${N}-neuron circuit (got ${p.size})`);
                onChange({ ...state, circuit: p });
              } catch (err) { alert(String(err)); }
            }} />
          </div>
        </div>
      </details>
    </>
  );
}

export function VisualEvoConfigPanel({ config, onChange, current }: { config: VisualEvoConfig; onChange: (c: VisualEvoConfig) => void; current: VisualState }) {
  const r = config.ranges;
  const rangeRow = (label: string, k: keyof VisualEvoConfig['ranges']) => (
    <div className="field" style={{ gridTemplateColumns: '74px 1fr 1fr' }}>
      <label>{label}</label>
      <input type="number" className="num" value={r[k][0]} step={0.5} onChange={(e) => onChange({ ...config, ranges: { ...r, [k]: [Number(e.target.value), r[k][1]] } })} />
      <input type="number" className="num" value={r[k][1]} step={0.5} onChange={(e) => onChange({ ...config, ranges: { ...r, [k]: [r[k][0], Number(e.target.value)] } })} />
    </div>
  );
  return (
    <>
      <CheckField label="bilaterally symmetric circuit" value={config.symmetric} onChange={(v) => onChange({ ...config, symmetric: v })} />
      <span className="small muted">{genes(config.symmetric).length} genes</span>
      {rangeRow('τ range', 'tau')}
      {rangeRow('θ range', 'bias')}
      {rangeRow('w range', 'weight')}
      {rangeRow('sensor gain', 'gain')}
      <IntField label="trials/shape" value={config.trials.count} min={1} max={40} onChange={(v) => onChange({ ...config, trials: { ...config.trials, count: v } })} />
      <NumberField label="offset range" value={config.trials.range} min={5} max={100} step={1} onChange={(v) => onChange({ ...config, trials: { ...config.trials, range: v } })} />
      <p className="small muted">Fitness = mean over trials of 1 − d (circles) or d (lines), where d is the final horizontal distance clipped to {config.maxDistance} and normalized.</p>
      <button className="btn small" onClick={() => onChange(visualAgent.defaultEvoConfig(current))}>Use explorer's trial set</button>
    </>
  );
}
