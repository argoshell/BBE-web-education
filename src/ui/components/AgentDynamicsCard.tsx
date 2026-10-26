// The Dynamics card for any agent with a CircuitView: the circuit's inputs and state are taken
// from the recording at the current time, and every non-zero parameter can be varied.

import { useMemo } from 'react';
import type { CircuitView } from '../../sim/agent';
import { getParam, paramKeys, paramLabel, rangeAround, setParam } from '../../sim/core/circuitParams';
import type { CTRNNParams } from '../../sim/core/ctrnn';
import type { Recording } from '../../sim/core/recording';
import { neuronColor, useTheme } from '../theme';
import { DynamicsCard, type FamilyOption } from './DynamicsPanel';

interface Props {
  view: CircuitView;
  rec: Recording;
  idx: number;
  /** Write a modified circuit back to the agent (clicking the bifurcation diagram). */
  onCircuit?: (c: CTRNNParams) => void;
  note?: string;
}

export function AgentDynamicsCard({ view, rec, idx, onCircuit, note }: Props) {
  const theme = useTheme();
  const c = view.circuit, n = c.size;
  const inputs = useMemo(() => Array.from({ length: n }, (_, i) => rec.channels[view.inputKey(i)]?.[idx] ?? 0), [rec, idx, n, view]);
  const state = useMemo(() => Array.from({ length: n }, (_, i) => rec.channels[view.stateKey(i)]?.[idx] ?? 0), [rec, idx, n, view]);
  const name = view.name ?? ((i: number) => `n${i + 1}`);
  const label = (key: string) => {
    // Use the agent's neuron names in parameter labels (e.g. wN1→M2)
    const [kind, a, b] = key.split(':');
    if (!view.name) return paramLabel(key);
    if (kind === 'w') return `w ${name(Number(a))}→${name(Number(b))}`;
    return `${{ tau: 'τ', bias: 'θ', gain: 'g' }[kind as 'tau' | 'bias' | 'gain']} ${name(Number(a))}`;
  };
  const families: FamilyOption[] = useMemo(() => paramKeys(n)
    // Skip absent connections and unit gains, which would only clutter the list
    .filter((key) => (key.startsWith('w') ? getParam(c, key) !== 0 : key.startsWith('gain') ? getParam(c, key) !== 1 : true))
    .map((key) => ({
      key, label: label(key), value: getParam(c, key), range: rangeAround(key, getParam(c, key)),
      family: { circuit: (l: number) => setParam(c, key, l), inputs: () => inputs },
      apply: onCircuit ? (v: number) => onCircuit(setParam(c, key, v)) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    })), [c, n, inputs, onCircuit]);
  const color = (i: number) => {
    const slot = view.colorSlot ? view.colorSlot(i) : i + 1;
    return slot > 0 ? neuronColor(theme, slot) : theme.text2;
  };
  return (
    <DynamicsCard circuit={c} inputs={inputs} state={state} families={families} neuronName={name} neuronColor={color}
      note={note ?? 'Sensory inputs are frozen at their values at the current time, so this analyzes the circuit as it is at this moment of the trial; scrub the time to see how the dynamics change as the inputs change.'} />
  );
}
