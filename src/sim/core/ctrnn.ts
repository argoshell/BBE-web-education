// Port of Beer's CTRNN class (CTRNN.cpp). Indices are 0-based here (1-based in C++).
// Weights are stored row-major by source neuron: w[from * size + to].
//
//   tau_i dy_i/dt = -y_i + sum_j w_ji * sigma(g_j (y_j + theta_j)) + I_i

import type { RandomState } from './random';

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function inverseSigmoid(y: number): number {
  return Math.log(y / (1 - y));
}

export interface CTRNNParams {
  size: number;
  taus: number[];
  biases: number[];
  gains: number[];
  /** Row-major by source neuron: weights[from * size + to]. */
  weights: number[];
}

export class CTRNN {
  size = 0;
  states = new Float64Array(0);
  outputs = new Float64Array(0);
  biases = new Float64Array(0);
  gains = new Float64Array(0);
  taus = new Float64Array(0);
  rtaus = new Float64Array(0);
  externalInputs = new Float64Array(0);
  weights = new Float64Array(0);
  private tempStates = new Float64Array(0);
  private tempOutputs = new Float64Array(0);
  private k1 = new Float64Array(0);
  private k2 = new Float64Array(0);
  private k3 = new Float64Array(0);
  private k4 = new Float64Array(0);

  constructor(size = 0) {
    this.setCircuitSize(size);
  }

  static fromParams(p: CTRNNParams): CTRNN {
    const c = new CTRNN(p.size);
    c.setParams(p);
    return c;
  }

  setParams(p: CTRNNParams): void {
    if (p.size !== this.size) this.setCircuitSize(p.size);
    for (let i = 0; i < p.size; i++) {
      this.setNeuronTimeConstant(i, p.taus[i]);
      this.biases[i] = p.biases[i];
      this.gains[i] = p.gains[i];
    }
    for (let k = 0; k < p.size * p.size; k++) this.weights[k] = p.weights[k];
  }

  getParams(): CTRNNParams {
    return {
      size: this.size,
      taus: Array.from(this.taus),
      biases: Array.from(this.biases),
      gains: Array.from(this.gains),
      weights: Array.from(this.weights),
    };
  }

  setCircuitSize(n: number): void {
    this.size = n;
    this.states = new Float64Array(n);
    this.outputs = new Float64Array(n);
    this.biases = new Float64Array(n);
    this.gains = new Float64Array(n).fill(1.0);
    this.taus = new Float64Array(n).fill(1.0);
    this.rtaus = new Float64Array(n).fill(1.0);
    this.externalInputs = new Float64Array(n);
    this.weights = new Float64Array(n * n);
    this.tempStates = new Float64Array(n);
    this.tempOutputs = new Float64Array(n);
    this.k1 = new Float64Array(n);
    this.k2 = new Float64Array(n);
    this.k3 = new Float64Array(n);
    this.k4 = new Float64Array(n);
  }

  setNeuronState(i: number, value: number): void {
    this.states[i] = value;
    this.outputs[i] = sigmoid(this.gains[i] * (this.states[i] + this.biases[i]));
  }

  setNeuronOutput(i: number, value: number): void {
    this.outputs[i] = value;
    this.states[i] = inverseSigmoid(value) / this.gains[i] - this.biases[i];
  }

  setNeuronTimeConstant(i: number, value: number): void {
    this.taus[i] = value;
    this.rtaus[i] = 1 / value;
  }

  weight(from: number, to: number): number {
    return this.weights[from * this.size + to];
  }

  setWeight(from: number, to: number, value: number): void {
    this.weights[from * this.size + to] = value;
  }

  setCenterCrossing(): void {
    for (let i = 0; i < this.size; i++) {
      let inputWeights = 0;
      for (let j = 0; j < this.size; j++) inputWeights += this.weight(j, i);
      this.biases[i] = -inputWeights / 2;
    }
  }

  randomizeCircuitState(lb: number, ub: number, rs: RandomState): void {
    for (let i = 0; i < this.size; i++) this.setNeuronState(i, rs.uniformRandom(lb, ub));
  }

  randomizeCircuitOutput(lb: number, ub: number, rs: RandomState): void {
    for (let i = 0; i < this.size; i++) this.setNeuronOutput(i, rs.uniformRandom(lb, ub));
  }

  eulerStep(stepSize: number): void {
    const n = this.size, w = this.weights, o = this.outputs, s = this.states;
    for (let i = 0; i < n; i++) {
      let input = this.externalInputs[i];
      for (let j = 0; j < n; j++) input += w[j * n + i] * o[j];
      s[i] += stepSize * this.rtaus[i] * (input - s[i]);
    }
    for (let i = 0; i < n; i++) o[i] = sigmoid(this.gains[i] * (s[i] + this.biases[i]));
  }

  rk4Step(stepSize: number): void {
    const n = this.size, w = this.weights, s = this.states;
    const ts = this.tempStates, to = this.tempOutputs;
    const { k1, k2, k3, k4, rtaus, gains, biases, externalInputs } = this;
    let input: number;

    for (let i = 0; i < n; i++) {
      input = externalInputs[i];
      for (let j = 0; j < n; j++) input += w[j * n + i] * this.outputs[j];
      k1[i] = stepSize * rtaus[i] * (input - s[i]);
      ts[i] = s[i] + 0.5 * k1[i];
      to[i] = sigmoid(gains[i] * (ts[i] + biases[i]));
    }
    for (let i = 0; i < n; i++) {
      input = externalInputs[i];
      for (let j = 0; j < n; j++) input += w[j * n + i] * to[j];
      k2[i] = stepSize * rtaus[i] * (input - ts[i]);
      ts[i] = s[i] + 0.5 * k2[i];
    }
    for (let i = 0; i < n; i++) to[i] = sigmoid(gains[i] * (ts[i] + biases[i]));
    for (let i = 0; i < n; i++) {
      input = externalInputs[i];
      for (let j = 0; j < n; j++) input += w[j * n + i] * to[j];
      k3[i] = stepSize * rtaus[i] * (input - ts[i]);
      ts[i] = s[i] + k3[i];
    }
    for (let i = 0; i < n; i++) to[i] = sigmoid(gains[i] * (ts[i] + biases[i]));
    for (let i = 0; i < n; i++) {
      input = externalInputs[i];
      for (let j = 0; j < n; j++) input += w[j * n + i] * to[j];
      k4[i] = stepSize * rtaus[i] * (input - ts[i]);
      s[i] += (1.0 / 6.0) * k1[i] + (1.0 / 3.0) * k2[i] + (1.0 / 3.0) * k3[i] + (1.0 / 6.0) * k4[i];
      this.outputs[i] = sigmoid(gains[i] * (s[i] + biases[i]));
    }
  }
}

/** Parse Beer's .ns format: size, taus, biases, gains, weights (row = from). Any whitespace. */
export function parseNs(text: string): CTRNNParams {
  const v = text.trim().split(/\s+/).map(Number);
  const size = v[0];
  if (!Number.isInteger(size) || size <= 0 || v.length < 1 + 3 * size + size * size)
    throw new Error('Invalid .ns circuit file');
  let k = 1;
  const take = (n: number) => v.slice(k, (k += n));
  return { size, taus: take(size), biases: take(size), gains: take(size), weights: take(size * size) };
}

export function formatNs(p: CTRNNParams): string {
  const rows: string[] = [String(p.size), '', p.taus.join(' '), '', p.biases.join(' '), '', p.gains.join(' '), ''];
  for (let i = 0; i < p.size; i++) rows.push(p.weights.slice(i * p.size, (i + 1) * p.size).join(' '));
  return rows.join('\n') + '\n';
}
