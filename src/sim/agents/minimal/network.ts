// Bilaterally symmetric CTRNN architectures of the minimally cognitive behavior experiments.
// Neurons: S ray sensory neurons (left to right), H interneurons, motor neurons M1 and M2 (M1 moves
// the agent right). Mirror images (ray i ↔ ray S−1−i, interneuron j ↔ H−1−j, M1 ↔ M2) share genes.
//
// The layouts reproduce the parameter counts printed in the papers:
//   Beer 1996 orientation, feedforward: 8; with motor recurrence and time constants: 12.
//   Slocum et al. 2000 short-term memory: 56 (4 interneurons), 82 (6); selective attention: 146 (10).
// All sensory neurons share one time constant, bias and gain; interneurons evolve their own gains;
// motor gains are fixed to 1.

import type { CTRNNParams } from '../../core/ctrnn';
import { mapSearchParameter } from '../../core/tsearch';

export interface Arch {
  sensors: number;
  inter: number;
  /** Connections from the sensors straight to the motor neurons. */
  sensorToMotor: boolean;
  /** Recurrent connections among the motor neurons (self and cross). */
  motorRecurrent: boolean;
  /** Evolve time constants (otherwise all are 1, as in Beer 1996's feedforward agents). */
  evolveTau: boolean;
}

export interface Ranges {
  weight: [number, number];
  bias: [number, number];
  sensorBias: [number, number];
  gain: [number, number];
  tau: [number, number];
}

export function archSize(a: Arch): number {
  return a.sensors + a.inter + 2;
}

export function neuronName(a: Arch, i: number): string {
  if (i < a.sensors) return `S${i + 1}`;
  if (i < a.sensors + a.inter) return `N${i - a.sensors + 1}`;
  return `M${i - a.sensors - a.inter + 1}`;
}

export function mirror(a: Arch, i: number): number {
  const S = a.sensors, H = a.inter;
  if (i < S) return S - 1 - i;
  if (i < S + H) return S + (H - 1 - (i - S));
  return i === S + H ? S + H + 1 : S + H;
}

/** Interneurons and motors take the categorical slots 1-8; sensors are muted. */
export function colorSlot(a: Arch, i: number): number {
  if (i < a.sensors) return 0;
  const k = i - a.sensors + 1;
  return k <= 8 ? k : 0;
}

interface Gene {
  label: string;
  kind: 'tau' | 'bias' | 'sensorBias' | 'gain' | 'weight';
  /** Neuron indices, or flat weight indices from·N + to. */
  targets: number[];
}

const cache = new Map<string, Gene[]>();

export function genes(a: Arch): Gene[] {
  const key = JSON.stringify(a);
  const hit = cache.get(key);
  if (hit) return hit;
  const N = archSize(a), S = a.sensors, H = a.inter;
  const sensors = Array.from({ length: S }, (_, i) => i);
  const inter = Array.from({ length: H }, (_, j) => S + j);
  const motors = [S + H, S + H + 1];
  const nm = (i: number) => neuronName(a, i);
  const orbits = (ids: number[]) => {
    const seen = new Set<number>(), out: number[][] = [];
    for (const i of ids) {
      if (seen.has(i)) continue;
      const o = mirror(a, i) !== i ? [i, mirror(a, i)] : [i];
      o.forEach((k) => seen.add(k));
      out.push(o);
    }
    return out;
  };
  const out: Gene[] = [];
  if (a.evolveTau) out.push({ label: 'τ S', kind: 'tau', targets: sensors });
  out.push({ label: 'θ S', kind: 'sensorBias', targets: sensors }, { label: 'g S', kind: 'gain', targets: sensors });
  for (const o of orbits(inter)) {
    const n = o.map(nm).join('/');
    if (a.evolveTau) out.push({ label: `τ ${n}`, kind: 'tau', targets: o });
    out.push({ label: `θ ${n}`, kind: 'bias', targets: o }, { label: `g ${n}`, kind: 'gain', targets: o });
  }
  if (a.evolveTau) out.push({ label: 'τ M1/M2', kind: 'tau', targets: motors });
  out.push({ label: 'θ M1/M2', kind: 'bias', targets: motors });

  const conns: [number, number][] = [];
  for (const s of sensors) for (const j of inter) conns.push([s, j]);
  if (a.sensorToMotor) for (const s of sensors) for (const m of motors) conns.push([s, m]);
  for (const i of inter) for (const j of inter) conns.push([i, j]);
  for (const j of inter) for (const m of motors) conns.push([j, m]);
  for (const m of motors) for (const j of inter) conns.push([m, j]);
  if (a.motorRecurrent) for (const m of motors) for (const k of motors) conns.push([m, k]);
  const seen = new Set<number>();
  for (const [f, t] of conns) {
    const k = f * N + t;
    if (seen.has(k)) continue;
    const km = mirror(a, f) * N + mirror(a, t);
    const targets = km !== k ? [k, km] : [k];
    targets.forEach((x) => seen.add(x));
    out.push({ label: `w ${nm(f)}→${nm(t)}`, kind: 'weight', targets });
  }
  cache.set(key, out);
  return out;
}

export function genomeSize(a: Arch): number {
  return genes(a).length;
}

export function genomeLabels(a: Arch): string[] {
  return genes(a).map((g) => g.label);
}

export function decode(g: ArrayLike<number>, a: Arch, r: Ranges): CTRNNParams {
  const N = archSize(a);
  const c: CTRNNParams = { size: N, taus: new Array(N).fill(1), biases: new Array(N).fill(0), gains: new Array(N).fill(1), weights: new Array(N * N).fill(0) };
  genes(a).forEach((gene, k) => {
    const [lo, hi] = r[gene.kind];
    let v = mapSearchParameter(g[k], lo, hi);
    // Gains are clipped to be positive and time constants to be at least 1 (genes may leave [−1, 1])
    if (gene.kind === 'gain') v = Math.max(v, 1e-6);
    if (gene.kind === 'tau') v = Math.max(v, 1);
    const arr = gene.kind === 'tau' ? c.taus : gene.kind === 'gain' ? c.gains : gene.kind === 'weight' ? c.weights : c.biases;
    for (const t of gene.targets) arr[t] = v;
  });
  return c;
}
