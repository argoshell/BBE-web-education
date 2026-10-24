// Addressing individual CTRNN parameters by key, for parameter maps and bifurcation diagrams.

import type { CTRNNParams } from './ctrnn';

/** A single circuit parameter, addressed as 'tau:i', 'bias:i', 'gain:i' or 'w:i:j' (0-based). */
export type ParamKey = string;

export function paramLabel(key: ParamKey): string {
  const [kind, a, b] = key.split(':').map((s, i) => (i ? Number(s) + 1 : s));
  if (kind === 'w') return `w${a}→${b}`;
  return `${{ tau: 'τ', bias: 'θ', gain: 'g' }[kind as 'tau' | 'bias' | 'gain']}${a}`;
}

export function getParam(c: CTRNNParams, key: ParamKey): number {
  const [kind, a, b] = key.split(':');
  const i = Number(a);
  if (kind === 'tau') return c.taus[i];
  if (kind === 'bias') return c.biases[i];
  if (kind === 'gain') return c.gains[i];
  return c.weights[i * c.size + Number(b)];
}

export function setParam(c: CTRNNParams, key: ParamKey, v: number): CTRNNParams {
  const [kind, a, b] = key.split(':');
  const i = Number(a);
  if (kind === 'tau') { const taus = c.taus.slice(); taus[i] = v; return { ...c, taus }; }
  if (kind === 'bias') { const biases = c.biases.slice(); biases[i] = v; return { ...c, biases }; }
  if (kind === 'gain') { const gains = c.gains.slice(); gains[i] = v; return { ...c, gains }; }
  const weights = c.weights.slice();
  weights[i * c.size + Number(b)] = v;
  return { ...c, weights };
}

export function paramKeys(n: number): ParamKey[] {
  const out: ParamKey[] = [];
  for (let i = 0; i < n; i++) out.push(`bias:${i}`);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push(`w:${i}:${j}`);
  for (let i = 0; i < n; i++) out.push(`tau:${i}`);
  for (let i = 0; i < n; i++) out.push(`gain:${i}`);
  return out;
}

/** Default scan range around a parameter's current value. */
export function rangeAround(key: ParamKey, v: number): [number, number] {
  const kind = key.split(':')[0];
  const r = (lo: number, hi: number): [number, number] => [Number(lo.toFixed(2)), Number(hi.toFixed(2))];
  if (kind === 'bias') return r(v - 6, v + 6);
  if (kind === 'w') return r(v - 8, v + 8);
  return r(Math.max(0.05, v / 4), Math.max(v * 4, 0.5));
}
