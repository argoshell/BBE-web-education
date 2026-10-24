// Sidebar controls and evolution genome settings for the klinotaxis worm.

import {
  chemoGenomeSize, chemotaxisAgent, neuronName, neuronSlot, wormRoles, type ChemoEvoConfig, type ChemoState, type WormParams,
} from '../../../sim/agents/chemotaxis';
import { IntField, NumberField, SelectField } from '../../components/controls';
import { WeightMatrix } from '../../components/WeightMatrix';
import { neuronColor, useTheme } from '../../theme';

interface Props {
  state: ChemoState;
  onChange: (s: ChemoState) => void;
  onPreset: (s: ChemoState) => void;
}

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

export function ChemotaxisControls({ state, onChange, onPreset }: Props) {
  const theme = useTheme();
  const w = state.worm, c = w.circuit, n = c.size, roles = wormRoles(n);
  const setWorm = (patch: Partial<WormParams>) => onChange({ ...state, worm: { ...w, ...patch } });
  const setTrial = (patch: Partial<ChemoState['trial']>) => onChange({ ...state, trial: { ...state.trial, ...patch } });
  const setRun = (patch: Partial<ChemoState['run']>) => onChange({ ...state, run: { ...state.run, ...patch } });
  const setArr = (key: 'taus' | 'biases', ids: number[], v: number) => {
    const a = c[key].slice();
    for (const i of ids) a[i] = v;
    setWorm({ circuit: { ...c, [key]: a } });
  };
  const setSensor = (key: 'wASEL' | 'wASER', i: number, v: number) => { const a = w[key].slice(); a[i] = v; setWorm({ [key]: a }); };
  const color = (i: number) => (neuronSlot(i, n) > 0 ? neuronColor(theme, neuronSlot(i, n)) : theme.text2);
  const neuronBlock = (label: string, ids: number[]) => (
    <div key={label} style={{ borderLeft: `3px solid ${color(ids[0])}`, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="small secondary">{label}</div>
      <NumberField label="τ (tau)" value={c.taus[ids[0]]} min={0.1} max={4.2} step={0.01} onChange={(v) => setArr('taus', ids, Math.max(1e-3, v))} />
      <NumberField label="θ (bias)" value={c.biases[ids[0]]} min={-15} max={15} step={0.01} onChange={(v) => setArr('biases', ids, v)} />
      {roles.inter.includes(ids[0]) && <>
        <NumberField label="w ON→" value={w.wASEL[ids[0]]} min={-1500} max={1500} step={1} onChange={(v) => setSensor('wASEL', ids[0], v)} title="Weight from the ON cell (ASEL)" />
        <NumberField label="w OFF→" value={w.wASER[ids[0]]} min={-1500} max={1500} step={1} onChange={(v) => setSensor('wASER', ids[0], v)} title="Weight from the OFF cell (ASER)" />
      </>}
    </div>
  );

  return (
    <>
      <details className="section" open>
        <summary>Trial</summary>
        <div className="section-body">
          <SelectField label="preset" value="" onChange={(v) => { const p = chemotaxisAgent.presets[Number(v)]; if (p) onPreset(p.params()); }}
            options={[{ value: '', label: 'Load a preset…' }, ...chemotaxisAgent.presets.map((p, i) => ({ value: String(i), label: p.name }))]} />
          <NumberField label="heading (°)" value={deg(state.trial.orient)} min={0} max={360} step={1} onChange={(v) => setTrial({ orient: rad(v) })}
            title="Initial heading. The worm starts 4.5 cm west of the peak, so 0° points at it." />
          <NumberField label="steepness" value={state.trial.gradSteep} min={0.05} max={1.5} step={0.01} onChange={(v) => setTrial({ gradSteep: Math.max(0, v) })}
            title="Concentration = −steepness × distance to the peak" />
          <SelectField label="strategy" value={state.trial.mode} onChange={(v) => setTrial({ mode: v })}
            options={[{ value: 'taxis', label: 'Klinotaxis (steer)' }, { value: 'kinesis', label: 'Klinokinesis (reverse)' }]} />
          <IntField label="seed" value={state.trial.seed} min={0} max={2147483646} onChange={(v) => setTrial({ seed: v })} />
        </div>
      </details>

      <details className="section">
        <summary>Run</summary>
        <div className="section-body">
          <NumberField label="transient (s)" value={state.run.transient} min={0} max={500} step={10} onChange={(v) => setRun({ transient: Math.max(0, v) })} />
          <NumberField label="scored (s)" value={state.run.evalDuration} min={1} max={500} step={10} onChange={(v) => setRun({ evalDuration: Math.max(state.run.dt, v) })} />
          <SelectField label="step (s)" value={String(state.run.dt)} onChange={(v) => setRun({ dt: Number(v) })}
            options={[0.02, 0.01, 0.005].map((d) => ({ value: String(d), label: `${d}${d === 0.01 ? ' (original)' : ''}` }))} />
          <IntField label="record every" value={state.run.sampleEvery} min={1} max={100} onChange={(v) => setRun({ sampleEvery: v })} />
        </div>
      </details>

      <details className="section" open>
        <summary>Sensors and motor output</summary>
        <div className="section-body">
          <NumberField label="N (s)" value={w.sensorN} min={0.1} max={4.2} step={0.01} onChange={(v) => setWorm({ sensorN: Math.max(state.run.dt, v) })}
            title="The sensors compare the mean concentration over the last N seconds…" />
          <NumberField label="M (s)" value={w.sensorM} min={0.1} max={4.2} step={0.01} onChange={(v) => setWorm({ sensorM: Math.max(state.run.dt, v) })}
            title="…with the mean over the M seconds before that" />
          <NumberField label="w CPG→SMB" value={w.wCpgV} min={0} max={15} step={0.01} onChange={(v) => setWorm({ wCpgV: v, wCpgD: v })}
            title="Head-sweep oscillator input to SMBV (sin) and SMBD (antiphase)" />
          <NumberField label="turn gain" value={w.outputGain} min={1} max={2} step={0.01} onChange={(v) => setWorm({ outputGain: v })}
            title="Turning rate = gain × (SMBV − SMBD)" />
        </div>
      </details>

      <details className="section" open>
        <summary>Neurons</summary>
        <div className="section-body">
          {roles.inter.map((i) => neuronBlock(`Interneuron ${neuronName(i, n)}`, [i]))}
          {neuronBlock('Neck motor neurons SMBV/SMBD (shared)', [roles.SMBV, roles.SMBD])}
          {neuronBlock('Forward command F (kinesis only)', [roles.F])}
          {neuronBlock('Backward command B (kinesis only)', [roles.B])}
        </div>
      </details>

      <details className="section">
        <summary>Connection weights</summary>
        <div className="section-body">
          <p className="small muted">Rows: from {Array.from({ length: n }, (_, i) => neuronName(i, n)).join(', ')}. Columns: to. The genome only sets
            interneuron→interneuron, →F/B and →SMB connections, plus the SMB self-connection.</p>
          <WeightMatrix size={n} weights={c.weights} range={15} onChange={(weights) => setWorm({ circuit: { ...c, weights } })} />
        </div>
      </details>
    </>
  );
}

export function ChemoEvoConfigPanel({ config, onChange, current }: { config: ChemoEvoConfig; onChange: (c: ChemoEvoConfig) => void; current: ChemoState }) {
  const t = config.trials;
  return (
    <>
      <IntField label="interneurons" value={config.size - 4} min={1} max={10} onChange={(v) => onChange({ ...config, size: v + 4 })} />
      <span className="small muted">{chemoGenomeSize(config.size)} genes (main.cpp: 6 interneurons, 93 genes)</span>
      <SelectField label="strategy" value={config.mode} onChange={(v) => onChange({ ...config, mode: v })}
        options={[{ value: 'taxis', label: 'Klinotaxis (main.cpp)' }, { value: 'kinesis', label: 'Klinokinesis' }]} />
      <IntField label="headings" value={t.orientations} min={1} max={24} onChange={(v) => onChange({ ...config, trials: { ...t, orientations: v } })} />
      <IntField label="runs each" value={t.repeats} min={1} max={4} onChange={(v) => onChange({ ...config, trials: { ...t, repeats: v } })} />
      <NumberField label="steepness" value={t.gradSteeps[0] ?? 0.5} min={0.05} max={1.5} step={0.01}
        onChange={(v) => onChange({ ...config, trials: { ...t, gradSteeps: [Math.max(0, v)] } })} />
      <p className="small muted">
        Fitness = mean over runs of max(0, 1 − d̄ / 4.5), where d̄ is the mean distance to the peak during the last
        {` ${config.run.evalDuration}`} s of each {config.run.transient + config.run.evalDuration} s run (main.cpp). Ranges as in main.cpp:
        sensor weights ±1500, other weights and biases ±15, τ and N, M in [0.1, 4.2] s, CPG weight [0, 15], turn gain [1, 2].
        One evaluation is {t.orientations * t.repeats * t.gradSteeps.length} runs of {Math.round((config.run.transient + config.run.evalDuration) / config.run.dt)} steps, so evolution is slow.
      </p>
      <button className="btn small" onClick={() => onChange(chemotaxisAgent.defaultEvoConfig(current))}>Use explorer's settings</button>
    </>
  );
}
