// Sidebar parameter editor for the walker, plus its evolution genome settings.

import { useRef } from 'react';
import { formatNs, parseNs } from '../../../sim/core/ctrnn';
import { defaultBody, type ControllerKind, type LegBodyParams } from '../../../sim/agents/legged/body';
import { controllerInfo, leggedAgent, resizeCircuit, withController, type WalkerEvoConfig, type WalkerState } from '../../../sim/agents/legged';
import { minNeurons } from '../../../sim/agents/legged/walker';
import { CheckField, IntField, NumberField, SelectField } from '../../components/controls';
import { WeightMatrix } from '../../components/WeightMatrix';
import { neuronColor, useTheme } from '../../theme';

const MAX_NEURONS = 8;
const kinds: ControllerKind[] = ['cpg', 'sensor', 'two', 'one', 'perfect'];
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

interface Props {
  state: WalkerState;
  onChange: (s: WalkerState) => void;
  /** Load a whole new configuration (preset). */
  onPreset: (s: WalkerState) => void;
}

export function WalkerControls({ state, onChange, onPreset }: Props) {
  const theme = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const c = state.circuit, n = c.size;
  const neural = state.controller !== 'perfect';

  const setCircuit = (patch: Partial<typeof c>) => onChange({ ...state, circuit: { ...c, ...patch } });
  const setArr = (key: 'taus' | 'biases' | 'gains', i: number, v: number) => {
    const a = c[key].slice();
    a[i] = v;
    setCircuit({ [key]: a });
  };
  const setBody = <K extends keyof LegBodyParams>(k: K, v: number) => onChange({ ...state, body: { ...state.body, [k]: v } });
  const setRun = (patch: Partial<WalkerState['run']>) => onChange({ ...state, run: { ...state.run, ...patch } });

  return (
    <>
      <details className="section" open>
        <summary>Controller</summary>
        <div className="section-body">
          <SelectField label="preset" value="" onChange={(v) => { const p = leggedAgent.presets[Number(v)]; if (p) onPreset(p.params()); }}
            options={[{ value: '', label: 'Load a preset…' }, ...leggedAgent.presets.map((p, i) => ({ value: String(i), label: p.name }))]} />
          <SelectField label="type" value={state.controller} onChange={(k) => onChange(withController(state, k))}
            options={kinds.map((k) => ({ value: k, label: controllerInfo[k].label }))} />
          <p className="note">{controllerInfo[state.controller].description}</p>
          {neural && (
            <IntField label="neurons" value={n} min={minNeurons[state.controller]} max={MAX_NEURONS}
              onChange={(v) => onChange({ ...state, circuit: resizeCircuit(c, v), sensorWeights: Array.from({ length: v }, (_, i) => state.sensorWeights[i] ?? 0) })} />
          )}
          {neural && (
            <div className="inline">
              <button className="btn small" onClick={() => fileRef.current?.click()}>Load .ns…</button>
              <button className="btn small" onClick={() => {
                const blob = new Blob([formatNs(c)], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'walker.ns';
                a.click();
                URL.revokeObjectURL(a.href);
              }}>Save .ns</button>
              <button className="btn small" title="Set biases to the center-crossing values θᵢ = −Σⱼ wⱼᵢ / 2" onClick={() => {
                const biases = Array.from({ length: n }, (_, i) => { let s = 0; for (let j = 0; j < n; j++) s += c.weights[j * n + i]; return -s / 2; });
                setCircuit({ biases });
              }}>Center-crossing</button>
              <input ref={fileRef} type="file" accept=".ns,.txt" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  const p = parseNs(await f.text());
                  const kind = p.size < minNeurons[state.controller] ? (p.size >= 2 ? 'two' : 'one') : state.controller;
                  onChange({ ...state, controller: kind, circuit: p, sensorWeights: new Array(p.size).fill(0) });
                } catch (err) { alert(String(err)); }
              }} />
            </div>
          )}
        </div>
      </details>

      {neural && (
        <details className="section" open>
          <summary>Neurons</summary>
          <div className="section-body">
            {Array.from({ length: n }, (_, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${neuronColor(theme, i + 1)}`, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div className="small secondary">Neuron {i + 1}{roleOf(state.controller, i)}</div>
                <NumberField label="τ (tau)" value={c.taus[i]} min={0.1} max={60} step={0.01} onChange={(v) => setArr('taus', i, Math.max(1e-3, v))} />
                <NumberField label="θ (bias)" value={c.biases[i]} min={-20} max={20} step={0.01} onChange={(v) => setArr('biases', i, v)} />
                <NumberField label="gain" value={c.gains[i]} min={0.05} max={5} step={0.01} onChange={(v) => setArr('gains', i, v)} />
                {state.controller === 'sensor' && (
                  <NumberField label="sensor s" value={state.sensorWeights[i] ?? 0} min={-20} max={20} step={0.01}
                    onChange={(v) => { const s = state.sensorWeights.slice(); s[i] = v; onChange({ ...state, sensorWeights: s }); }} />
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {neural && (
        <details className="section" open>
          <summary>Connection weights</summary>
          <div className="section-body">
            <WeightMatrix size={n} weights={c.weights} range={16} onChange={(weights) => setCircuit({ weights })} />
          </div>
        </details>
      )}

      <details className="section">
        <summary>Simulation</summary>
        <div className="section-body">
          <NumberField label="duration" value={state.run.duration} min={10} max={1000} step={10} onChange={(v) => setRun({ duration: Math.max(1, v) })} />
          <NumberField label="step size" value={state.run.dt} min={0.01} max={0.5} step={0.01} onChange={(v) => setRun({ dt: Math.max(0.001, v) })} />
          <CheckField label="randomize initial angle & states" value={state.run.randomize} onChange={(v) => setRun({ randomize: v })} />
          {state.run.randomize && <IntField label="seed" value={state.run.seed} min={0} max={2147483646} onChange={(v) => setRun({ seed: v })} />}
        </div>
      </details>

      <details className="section">
        <summary>Body</summary>
        <div className="section-body">
          <NumberField label="max force" value={state.body.maxLegForce} min={0.005} max={0.2} step={0.001} onChange={(v) => setBody('maxLegForce', v)} />
          <NumberField label="fwd limit °" value={deg(state.body.forwardAngleLimit)} min={5} max={80} step={0.5} onChange={(v) => setBody('forwardAngleLimit', rad(v))} />
          <NumberField label="back limit °" value={deg(state.body.backwardAngleLimit)} min={-80} max={-5} step={0.5} onChange={(v) => setBody('backwardAngleLimit', rad(v))} />
          <NumberField label="leg length" value={state.body.legLength} min={5} max={30} step={0.5} onChange={(v) => setBody('legLength', v)} />
          <NumberField label="max torque" value={state.body.maxTorque} min={0.05} max={2} step={0.01} onChange={(v) => setBody('maxTorque', v)} />
          <NumberField label="max ω" value={state.body.maxOmega} min={0.1} max={5} step={0.01} onChange={(v) => setBody('maxOmega', v)} />
          <NumberField label="max velocity" value={state.body.maxVelocity} min={0.5} max={20} step={0.1} onChange={(v) => setBody('maxVelocity', v)} />
          <NumberField label="unstable at" value={state.body.instabilityDistance} min={5} max={40} step={0.5} onChange={(v) => setBody('instabilityDistance', v)}
            title="The body falls (velocity 0) when the foot is this far behind it" />
          <button className="btn small" onClick={() => onChange({ ...state, body: { ...defaultBody } })}>Reset body to Beer's constants</button>
        </div>
      </details>
    </>
  );
}

function roleOf(kind: ControllerKind, i: number): string {
  if (kind === 'cpg' || kind === 'sensor') return [' · foot', ' · forward swing', ' · backward swing'][i] ?? ' · interneuron';
  if (kind === 'two') return [' · foot + forward', ' · backward'][i] ?? '';
  if (kind === 'one') return i === 0 ? ' · foot + forces (angle input)' : ' · unused';
  return '';
}

interface EvoProps {
  config: WalkerEvoConfig;
  onChange: (c: WalkerEvoConfig) => void;
  current: WalkerState;
}

export function WalkerEvoConfigPanel({ config, onChange, current }: EvoProps) {
  const { spec } = config;
  const r = spec.ranges;
  const setSpec = (patch: Partial<typeof spec>) => onChange({ ...config, spec: { ...spec, ...patch } });
  const setRange = (k: 'tau' | 'bias' | 'weight' | 'sensor' | 'gain', v: [number, number] | undefined) => setSpec({ ranges: { ...r, [k]: v } });
  const rangeRow = (label: string, k: 'tau' | 'bias' | 'weight' | 'sensor' | 'gain') => {
    const v = r[k] ?? [0.5, 2];
    return (
      <div className="field" style={{ gridTemplateColumns: '74px 1fr 1fr' }}>
        <label>{label}</label>
        <input type="number" className="num" value={v[0]} step={0.5} onChange={(e) => setRange(k, [Number(e.target.value), v[1]])} />
        <input type="number" className="num" value={v[1]} step={0.5} onChange={(e) => setRange(k, [v[0], Number(e.target.value)])} />
      </div>
    );
  };
  return (
    <>
      <SelectField label="controller" value={spec.controller}
        onChange={(k) => setSpec({ controller: k, size: Math.max(minNeurons[k], spec.size) })}
        options={kinds.filter((k) => k !== 'perfect').map((k) => ({ value: k, label: controllerInfo[k].label }))} />
      <IntField label="neurons" value={spec.size} min={minNeurons[spec.controller]} max={MAX_NEURONS} onChange={(v) => setSpec({ size: v })} />
      {rangeRow('τ range', 'tau')}
      {rangeRow('θ range', 'bias')}
      {rangeRow('w range', 'weight')}
      {spec.controller === 'sensor' && rangeRow('sensor range', 'sensor')}
      <CheckField label="evolve gains" value={!!r.gain} onChange={(v) => setRange('gain', v ? [0.5, 2] : undefined)} />
      {r.gain && rangeRow('gain range', 'gain')}
      <NumberField label="trial length" value={config.run.duration} min={20} max={1000} step={10} onChange={(v) => onChange({ ...config, run: { ...config.run, duration: Math.max(1, v) } })} />
      <CheckField label="randomize initial state per trial" value={config.run.randomize} onChange={(v) => onChange({ ...config, run: { ...config.run, randomize: v } })} />
      <p className="small muted">Fitness = average velocity over the trial. Body constants and step size come from the explorer.</p>
      <button className="btn small" onClick={() => onChange(leggedAgent.defaultEvoConfig(current))}>Use explorer's controller & body</button>
    </>
  );
}
