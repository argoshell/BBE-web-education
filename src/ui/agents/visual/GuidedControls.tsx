// Sidebar controls and evolution settings for the visually guided tasks.

import { BodySize } from '../../../sim/agents/visual/body';
import {
  CIRCUITSIZE, GENOME_SIZE, guidedAgent, guidedColorSlot, guidedNeuronName, NUMINTER, taskInfo,
  type GuidedEvoConfig, type GuidedEvoTask, type GuidedState, type GuidedTask, type TrialGrid,
} from '../../../sim/agents/visual/guided';
import { IntField, NumberField, SelectField } from '../../components/controls';
import { WeightMatrix } from '../../components/WeightMatrix';
import { neuronColor, useTheme } from '../../theme';

interface Props {
  state: GuidedState;
  onChange: (s: GuidedState) => void;
  onPreset: (s: GuidedState) => void;
}

const taskOptions: { value: GuidedTask; label: string }[] = [
  { value: 'size', label: 'Size discrimination (circles)' },
  { value: 'aperture', label: 'Perceiving affordances (apertures)' },
];

function GridFields({ grid, onChange }: { grid: TrialGrid; onChange: (g: TrialGrid) => void }) {
  return (
    <>
      <NumberField label="max start x" value={grid.posMax} min={2} max={80} step={1} onChange={(v) => onChange({ ...grid, posMax: v })}
        title="Start positions run from 0 to this (0 itself is skipped: a symmetric agent cannot break symmetry there)" />
      <NumberField label="x step" value={grid.posStep} min={0.5} max={20} step={0.5} onChange={(v) => onChange({ ...grid, posStep: Math.max(0.5, v) })} />
      <NumberField label="min size" value={grid.sizeMin} min={2} max={60} step={1} onChange={(v) => onChange({ ...grid, sizeMin: v })} />
      <NumberField label="max size" value={grid.sizeMax} min={2} max={80} step={1} onChange={(v) => onChange({ ...grid, sizeMax: v })} />
      <NumberField label="size step" value={grid.sizeStep} min={0.5} max={20} step={0.5} onChange={(v) => onChange({ ...grid, sizeStep: Math.max(0.5, v) })} />
    </>
  );
}

export function GuidedControls({ state, onChange, onPreset }: Props) {
  const theme = useTheme();
  const c = state.circuit;
  const setArr = (key: 'taus' | 'biases' | 'gains', ids: number[], v: number) => {
    const a = c[key].slice();
    for (const i of ids) a[i] = v;
    onChange({ ...state, circuit: { ...c, [key]: a } });
  };
  const setTrial = (patch: Partial<GuidedState['trial']>) => onChange({ ...state, trial: { ...state.trial, ...patch } });
  // Mirror-symmetric pairs share parameters in the genome; edit them together
  const pairs: number[][] = [];
  for (let i = 0; i < Math.ceil(NUMINTER / 2); i++) pairs.push(i === NUMINTER - 1 - i ? [i] : [i, NUMINTER - 1 - i]);
  pairs.push([NUMINTER, NUMINTER + 1]);
  const neuronBlock = (ids: number[]) => (
    <div key={ids.join()} style={{ borderLeft: `3px solid ${neuronColor(theme, guidedColorSlot(ids[0]))}`, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div className="small secondary">{ids.map(guidedNeuronName).join(' / ')}{ids[0] >= NUMINTER ? ' (M1 pushes right, M2 left)' : ''}</div>
      <NumberField label="τ (tau)" value={c.taus[ids[0]]} min={0.5} max={5} step={0.01} onChange={(v) => setArr('taus', ids, Math.max(1e-3, v))} />
      <NumberField label="θ (bias)" value={c.biases[ids[0]]} min={-10} max={10} step={0.01} onChange={(v) => setArr('biases', ids, v)} />
      <NumberField label="gain" value={c.gains[ids[0]]} min={0.1} max={8} step={0.01} onChange={(v) => setArr('gains', ids, v)} />
    </div>
  );
  const info = taskInfo[state.task];

  return (
    <>
      <details className="section" open>
        <summary>Task and trial</summary>
        <div className="section-body">
          <SelectField label="preset" value="" onChange={(v) => { const p = guidedAgent.presets[Number(v)]; if (p) onPreset(p.params()); }}
            options={[{ value: '', label: 'Load a preset…' }, ...guidedAgent.presets.map((p, i) => ({ value: String(i), label: p.name }))]} />
          <SelectField label="task" value={state.task} onChange={(v) => onChange({ ...state, task: v })} options={taskOptions} />
          <NumberField label={state.task === 'size' ? 'circle x' : 'gap center x'} value={state.trial.pos} min={-80} max={80} step={0.5}
            onChange={(v) => setTrial({ pos: v })} title="Initial horizontal position relative to the agent" />
          <NumberField label={state.task === 'size' ? 'diameter' : 'gap width'} value={state.trial.size} min={2} max={80} step={0.5}
            onChange={(v) => setTrial({ size: Math.max(0.5, v) })} />
          <p className="small muted" style={{ margin: 0 }}>
            Body diameter {BodySize}: {state.task === 'size' ? 'circles' : 'gaps'} below it should be {info.small === 'catch' ? 'caught' : 'avoided'},
            above it {info.large === 'avoid' ? 'avoided' : 'passed through'}.
          </p>
        </div>
      </details>

      <details className="section">
        <summary>Trial grid (overview &amp; fitness)</summary>
        <div className="section-body">
          <GridFields grid={state.grid} onChange={(grid) => onChange({ ...state, grid })} />
          <NumberField label="max distance" value={state.maxDistance} min={5} max={150} step={1} onChange={(v) => onChange({ ...state, maxDistance: Math.max(1, v) })}
            title="Final distances are clipped to this when scoring (MAXDISTANCE = 75)" />
        </div>
      </details>

      <details className="section" open>
        <summary>Neurons (mirror pairs)</summary>
        <div className="section-body">{pairs.map(neuronBlock)}</div>
      </details>

      <details className="section">
        <summary>Connection weights</summary>
        <div className="section-body">
          <p className="small muted">Rows: from N1–N7, M1–M2 (8, 9). Columns: to. Ray → interneuron weights come from the genome and are not editable here.</p>
          <WeightMatrix size={CIRCUITSIZE} weights={c.weights} range={10} onChange={(weights) => onChange({ ...state, circuit: { ...c, weights } })} />
        </div>
      </details>
    </>
  );
}

export function GuidedEvoConfigPanel({ config, onChange }: { config: GuidedEvoConfig; onChange: (c: GuidedEvoConfig) => void }) {
  const r = config.ranges;
  const pair = (label: string, k: 'tau' | 'gain') => (
    <div className="field" style={{ gridTemplateColumns: '74px 1fr 1fr' }}>
      <label>{label}</label>
      <input type="number" className="num" value={r[k][0]} step={0.5} onChange={(e) => onChange({ ...config, ranges: { ...r, [k]: [Number(e.target.value), r[k][1]] } })} />
      <input type="number" className="num" value={r[k][1]} step={0.5} onChange={(e) => onChange({ ...config, ranges: { ...r, [k]: [r[k][0], Number(e.target.value)] } })} />
    </div>
  );
  return (
    <>
      <SelectField<GuidedEvoTask> label="task" value={config.task} onChange={(v) => onChange({ ...config, task: v })}
        options={[{ value: 'both', label: 'Both (product, as in main.cpp)' }, ...taskOptions]} />
      <span className="small muted">{GENOME_SIZE} genes (left-right symmetric)</span>
      <NumberField label="|w| max" value={r.weight} min={1} max={20} step={0.5} onChange={(v) => onChange({ ...config, ranges: { ...r, weight: v } })} />
      <NumberField label="|θ| max" value={r.bias} min={1} max={20} step={0.5} onChange={(v) => onChange({ ...config, ranges: { ...r, bias: v } })} />
      {pair('τ range', 'tau')}
      {pair('gain range', 'gain')}
      <GridFields grid={config.grid} onChange={(grid) => onChange({ ...config, grid })} />
      <IntField label="repetitions" value={config.grid.reps} min={1} max={4} onChange={(v) => onChange({ ...config, grid: { ...config.grid, reps: v } })} />
      <p className="small muted">
        Trial score: (75 − d)/75 when the agent should end under the object (catch a small circle, pass a wide gap), d/75 when it
        should avoid it, with d the final horizontal distance clipped to {config.maxDistance}. Each task&apos;s fitness is the mean
        score; “both” multiplies them. Each evaluation runs {config.task === 'both' ? '2 × ' : ''}one trial per grid cell, so a
        generation takes a few seconds.
      </p>
    </>
  );
}
