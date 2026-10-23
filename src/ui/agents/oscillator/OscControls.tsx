// Sidebar controls and evolution genome settings for the oscillator.

import { useRef } from 'react';
import { formatNs, parseNs } from '../../../sim/core/ctrnn';
import { resizeCircuit } from '../../../sim/agents/legged';
import { centerCrossingBiases, oscillatorAgent, type OscEvoConfig, type OscState } from '../../../sim/agents/oscillator';
import { CheckField, IntField, NumberField, SelectField } from '../../components/controls';
import { WeightMatrix } from '../../components/WeightMatrix';
import { neuronColor, useTheme } from '../../theme';

interface Props {
  state: OscState;
  onChange: (s: OscState) => void;
  onPreset: (s: OscState) => void;
}

export function OscControls({ state, onChange, onPreset }: Props) {
  const theme = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const c = state.circuit, n = c.size;
  const shownBiases = state.centerCrossing ? centerCrossingBiases(c) : c.biases;
  const setArr = (key: 'taus' | 'biases' | 'gains', i: number, v: number) => {
    const a = c[key].slice();
    a[i] = v;
    onChange({ ...state, circuit: { ...c, [key]: a } });
  };
  const setRun = (patch: Partial<OscState['run']>) => onChange({ ...state, run: { ...state.run, ...patch } });

  return (
    <>
      <details className="section" open>
        <summary>Circuit</summary>
        <div className="section-body">
          <SelectField label="preset" value="" onChange={(v) => { const p = oscillatorAgent.presets[Number(v)]; if (p) onPreset(p.params()); }}
            options={[{ value: '', label: 'Load a preset…' }, ...oscillatorAgent.presets.map((p, i) => ({ value: String(i), label: p.name }))]} />
          <IntField label="neurons" value={n} min={1} max={8} onChange={(v) => onChange({ ...state, circuit: resizeCircuit(c, v) })} />
          <CheckField label="center-crossing biases (θᵢ = −Σⱼ wⱼᵢ / 2)" value={state.centerCrossing}
            onChange={(v) => onChange({ ...state, centerCrossing: v, circuit: v ? c : { ...c, biases: centerCrossingBiases(c) } })} />
          <div className="inline">
            <button className="btn small" onClick={() => fileRef.current?.click()}>Load .ns…</button>
            <button className="btn small" onClick={() => {
              const blob = new Blob([formatNs({ ...c, biases: shownBiases })], { type: 'text/plain' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'oscillator.ns';
              a.click();
              URL.revokeObjectURL(a.href);
            }}>Save .ns</button>
            <input ref={fileRef} type="file" accept=".ns,.txt" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const p = parseNs(await f.text());
                if (p.size > 8) throw new Error('The oscillator page supports up to 8 neurons');
                onChange({ ...state, circuit: p, centerCrossing: false });
              } catch (err) { alert(String(err)); }
            }} />
          </div>
        </div>
      </details>

      <details className="section" open>
        <summary>Neurons</summary>
        <div className="section-body">
          {Array.from({ length: n }, (_, i) => (
            <div key={i} style={{ borderLeft: `3px solid ${neuronColor(theme, i + 1)}`, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className="small secondary">Neuron {i + 1}</div>
              <NumberField label="τ (tau)" value={c.taus[i]} min={0.1} max={20} step={0.01} onChange={(v) => setArr('taus', i, Math.max(1e-3, v))} />
              {state.centerCrossing
                ? <div className="field"><label>θ (bias)</label><span className="small muted">center-crossing</span><span className="num small">{shownBiases[i].toFixed(3)}</span></div>
                : <NumberField label="θ (bias)" value={c.biases[i]} min={-20} max={20} step={0.01} onChange={(v) => setArr('biases', i, v)} />}
              <NumberField label="gain" value={c.gains[i]} min={0.05} max={5} step={0.01} onChange={(v) => setArr('gains', i, v)} />
            </div>
          ))}
        </div>
      </details>

      <details className="section" open>
        <summary>Connection weights</summary>
        <div className="section-body">
          <WeightMatrix size={n} weights={c.weights} range={16} onChange={(weights) => onChange({ ...state, circuit: { ...c, weights } })} />
        </div>
      </details>

      <details className="section">
        <summary>Simulation &amp; fitness</summary>
        <div className="section-body">
          <NumberField label="duration" value={state.run.duration} min={10} max={1000} step={10} onChange={(v) => setRun({ duration: Math.max(1, v) })} />
          <NumberField label="step size" value={state.run.dt} min={0.005} max={0.2} step={0.005} onChange={(v) => setRun({ dt: Math.max(1e-4, v) })} />
          <SelectField label="integrator" value={state.run.integrator} onChange={(v) => setRun({ integrator: v })}
            options={[{ value: 'euler', label: 'Euler (as in TSearch examples)' }, { value: 'rk4', label: '4th-order Runge-Kutta' }]} />
          <NumberField label="transient" value={state.run.transient} min={0} max={500} step={5} onChange={(v) => setRun({ transient: Math.max(0, v) })}
            title="Ignored when measuring period, amplitude and fitness" />
          <NumberField label="init range" value={state.run.initRange} min={0} max={5} step={0.1} onChange={(v) => setRun({ initRange: Math.max(0, v) })}
            title="Initial neuron states are uniform in ±this" />
          <IntField label="seed" value={state.run.seed} min={0} max={2147483646} onChange={(v) => setRun({ seed: v })} />
          <SelectField label="fitness" value={state.fitness.kind} onChange={(v) => onChange({ ...state, fitness: { ...state.fitness, kind: v } })}
            options={[{ value: 'change', label: 'Total output change' }, { value: 'period', label: 'Match target period' }]} />
          {state.fitness.kind === 'period' && (
            <NumberField label="target period" value={state.fitness.targetPeriod} min={1} max={100} step={0.5}
              onChange={(v) => onChange({ ...state, fitness: { ...state.fitness, targetPeriod: Math.max(0.1, v) } })} />
          )}
        </div>
      </details>
    </>
  );
}

export function OscEvoConfigPanel({ config, onChange, current }: { config: OscEvoConfig; onChange: (c: OscEvoConfig) => void; current: OscState }) {
  const r = config.ranges;
  const rangeRow = (label: string, k: 'tau' | 'bias' | 'weight' | 'gain') => {
    const v = r[k] ?? [0.5, 2];
    return (
      <div className="field" style={{ gridTemplateColumns: '74px 1fr 1fr' }}>
        <label>{label}</label>
        <input type="number" className="num" value={v[0]} step={0.5} onChange={(e) => onChange({ ...config, ranges: { ...r, [k]: [Number(e.target.value), v[1]] } })} />
        <input type="number" className="num" value={v[1]} step={0.5} onChange={(e) => onChange({ ...config, ranges: { ...r, [k]: [v[0], Number(e.target.value)] } })} />
      </div>
    );
  };
  return (
    <>
      <IntField label="neurons" value={config.size} min={1} max={8} onChange={(v) => onChange({ ...config, size: v })} />
      <CheckField label="center-crossing (biases not evolved)" value={config.centerCrossing} onChange={(v) => onChange({ ...config, centerCrossing: v })} />
      {rangeRow('τ range', 'tau')}
      {!config.centerCrossing && rangeRow('θ range', 'bias')}
      {rangeRow('w range', 'weight')}
      <CheckField label="evolve gains" value={!!r.gain} onChange={(v) => onChange({ ...config, ranges: { ...r, gain: v ? [0.5, 2] : undefined } })} />
      {r.gain && rangeRow('gain range', 'gain')}
      <SelectField label="fitness" value={config.fitness.kind} onChange={(v) => onChange({ ...config, fitness: { ...config.fitness, kind: v } })}
        options={[{ value: 'change', label: 'Total output change' }, { value: 'period', label: 'Match target period' }]} />
      {config.fitness.kind === 'period' && (
        <NumberField label="target period" value={config.fitness.targetPeriod} min={1} max={100} step={0.5}
          onChange={(v) => onChange({ ...config, fitness: { ...config.fitness, targetPeriod: Math.max(0.1, v) } })} />
      )}
      <NumberField label="trial length" value={config.run.duration} min={20} max={1000} step={10} onChange={(v) => onChange({ ...config, run: { ...config.run, duration: Math.max(1, v) } })} />
      <NumberField label="step size" value={config.run.dt} min={0.01} max={0.2} step={0.01} onChange={(v) => onChange({ ...config, run: { ...config.run, dt: Math.max(1e-3, v) } })} />
      <p className="small muted">
        {config.fitness.kind === 'change'
          ? 'Fitness = average |Δ output| per time unit over all neurons, after the transient.'
          : 'Fitness = mean amplitude × closeness of neuron 1\'s period to the target (Gaussian in log period, σ = 0.1).'}
      </p>
      <button className="btn small" onClick={() => onChange(oscillatorAgent.defaultEvoConfig(current))}>Use explorer's settings</button>
    </>
  );
}
