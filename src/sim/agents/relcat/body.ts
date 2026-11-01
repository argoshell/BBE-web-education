// Port of Nathaniel Rodriguez's relcat (github.com/Nathaniel-Rodriguez/relcat, pinned in
// scripts/fetch-relcat.mjs), a Python implementation of the relational categorization task of
// Williams, Beer & Gasser (2008) and Williams & Beer (2013), adapted from Beer's C++.
//
// Task: a circle falls toward the agent while the agent is held still (phase 1); a second circle
// then falls and the agent may move (phase 2). It must catch the second circle if it is smaller
// than the first, and avoid it otherwise.
//
// Faithful to the Python, including its quirks (each is reproduced so results match it):
//  - neuron outputs are sigma(g * y + theta) (Beer's C++ uses sigma(g * (y + theta)))
//  - Circle.ray_intersection reuses the same root twice, so a ray always ends at the FAR side of a
//    circle it crosses (the C++ it was adapted from takes the near side)
//  - the trial grid is sized circle_max_diameter / circle_difference = 10, so sizes run 20..65
//    rather than 20..50
//  - states are clipped to +-((ln DBL_MAX - bias_limit) / gain_limit) to avoid overflow
// Coordinates: x to the right, y DOWNWARD (top of the world is y = 0); the agent sits at the bottom.

export interface RelcatParams {
  worldLeft: number;
  worldRight: number;
  worldTop: number;
  worldBottom: number;
  agentRadius: number;
  mass: number;
  visualAngle: number;
  numRays: number;
  numInterneurons: number;
  maxDistance: number;
  maxRayLength: number;
  maxVelocity: number;
  objVelocity: number;
  circleMinDiameter: number;
  circleMaxDiameter: number;
  circleDifference: number;
  stepSize: number;
  minWeight: number;
  maxWeight: number;
  minBias: number;
  maxBias: number;
  minTau: number;
  maxTau: number;
}

export const defaultRelcatParams: RelcatParams = {
  worldLeft: 0, worldRight: 400, worldTop: 0, worldBottom: 300, agentRadius: 15, mass: 0.2, visualAngle: Math.PI / 6,
  numRays: 7, numInterneurons: 3, maxDistance: 75, maxRayLength: 220, maxVelocity: 5, objVelocity: 3.0,
  circleMinDiameter: 20, circleMaxDiameter: 50, circleDifference: 5, stepSize: 0.1,
  minWeight: -16, maxWeight: 16, minBias: -16, maxBias: 16, minTau: 1, maxTau: 30,
};

/** Network: n = numInterneurons + 2 neurons (interneurons, then left and right motor neurons). */
export interface RelcatNet {
  size: number;
  numRays: number;
  /** sensorWeights[ray * size + neuron] (motor columns are zero). */
  sensorWeights: number[];
  /** weights[from * size + to]. */
  weights: number[];
  biases: number[];
  gains: number[];
  taus: number[];
}

const MAXSTATE = (Math.log(Number.MAX_VALUE) - 16) / 1;

export class SensorCTRNN {
  states: Float64Array;
  outputs: Float64Array;
  sensors: Float64Array;
  private inputs: Float64Array;
  net: RelcatNet;
  constructor(net: RelcatNet) {
    this.net = net;
    this.states = new Float64Array(net.size);
    this.outputs = new Float64Array(net.size);
    this.sensors = new Float64Array(net.numRays);
    this.inputs = new Float64Array(net.size);
  }

  /** randomize_state(0, 0) followed by zeroing the sensors. */
  initialize(): void {
    const { size, biases } = this.net;
    for (let i = 0; i < size; i++) {
      this.states[i] = 0;
      // outputs = sigmoid(gains * 0 + biases) for the zeroed states
      this.outputs[i] = 1 / (1 + Math.exp(-biases[i]));
    }
    this.sensors.fill(0);
  }

  /** Total input to each neuron from the sensors (for analysis). */
  sensorInput(i: number): number {
    const { size, numRays, sensorWeights } = this.net;
    let s = 0;
    for (let r = 0; r < numRays; r++) s += sensorWeights[r * size + i] * this.sensors[r];
    return s;
  }

  eulerStep(dt: number): void {
    const { size, numRays, sensorWeights, weights, taus, gains, biases } = this.net;
    const inp = this.inputs;
    for (let i = 0; i < size; i++) {
      let s = 0;
      for (let r = 0; r < numRays; r++) s += sensorWeights[r * size + i] * this.sensors[r];
      let c = 0;
      for (let j = 0; j < size; j++) c += weights[j * size + i] * this.outputs[j];
      inp[i] = s + c;
    }
    for (let i = 0; i < size; i++) {
      let y = this.states[i] + dt * (1 / taus[i]) * (inp[i] - this.states[i]);
      if (y < -MAXSTATE) y = -MAXSTATE;
      if (y > MAXSTATE) y = MAXSTATE;
      this.states[i] = y;
    }
    for (let i = 0; i < size; i++) this.outputs[i] = 1 / (1 + Math.exp(-(gains[i] * this.states[i] + biases[i])));
  }
}

export interface Ray {
  x1: number; y1: number; x2: number; y2: number;
  angle: number; length: number; relX: number; relY: number;
}

/** numpy.linspace(start, stop, n). */
function linspace(start: number, stop: number, n: number): number[] {
  if (n === 1) return [start];
  const step = (stop - start) / (n - 1);
  const out = Array.from({ length: n }, (_, k) => k * step + start);
  out[n - 1] = stop;
  return out;
}

export class Circle {
  size: number;
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  constructor(size: number, cx: number, cy: number, vx = 0, vy = 0) {
    this.size = size; this.cx = cx; this.cy = cy; this.vx = vx; this.vy = vy;
  }
  leadingEdgeY(): number {
    return this.cy + this.size;
  }
  step(dt: number): void {
    this.cx += dt * this.vx;
    this.cy += dt * this.vy;
  }
  rayIntersection(ray: Ray): void {
    const dx = ray.x2 - ray.x1, dy = ray.y2 - ray.y1;
    let u = ((this.cx - ray.x1) * dx + (this.cy - ray.y1) * dy) / (dx * dx + dy * dy);
    const nearX = ray.x1 + u * dx, nearY = ray.y1 + u * dy;
    if (Math.sqrt((this.cx - nearX) * (this.cx - nearX) + (this.cy - nearY) * (this.cy - nearY)) > this.size) return;
    const a = dx * dx + dy * dy;
    const b = 2 * (dx * (ray.x1 - this.cx) + dy * (ray.y1 - this.cy));
    const c = this.cx * this.cx + this.cy * this.cy + ray.x1 * ray.x1 + ray.y1 * ray.y1
      - 2 * (this.cx * ray.x1 + this.cy * ray.y1) - this.size * this.size;
    const i = b * b - 4 * a * c;
    if (i === 0) {
      u = -b / (2 * a);
      if (u >= 0 && u <= 1) { ray.x2 = ray.x1 + u * dx; ray.y2 = ray.y1 + u * dy; }
    } else if (i > 0) {
      let distance1 = 9999999;
      u = (-b + Math.sqrt(i)) / (2 * a);
      if (u >= 0 && u <= 1) {
        ray.x2 = ray.x1 + u * dx;
        ray.y2 = ray.y1 + u * dy;
        distance1 = Math.sqrt((ray.x2 - ray.x1) * (ray.x2 - ray.x1) + (ray.y2 - ray.y1) * (ray.y2 - ray.y1));
      }
      // As in relcat: the second root is never computed (u is reused), so this cannot change the result
      if (u >= 0 && u <= 1) {
        const ex = ray.x1 + u * dx, ey = ray.y1 + u * dy;
        const distance2 = Math.sqrt((ex - ray.x1) * (ex - ray.x1) + (ey - ray.y1) * (ey - ray.y1));
        if (distance2 < distance1) { ray.x2 = ex; ray.y2 = ey; }
      }
    }
  }
}

export class SensorAgent {
  radius: number;
  mass: number;
  visualAngle: number;
  numRays: number;
  maxRayLength: number;
  x: number;
  y: number;
  maxVelocity: number;
  vx = 0;
  ns: SensorCTRNN;
  rays: Ray[];

  constructor(p: RelcatParams, net: RelcatNet, x: number, y: number) {
    this.radius = p.agentRadius;
    this.mass = p.mass;
    this.visualAngle = p.numRays === 1 ? 0 : p.visualAngle;
    this.numRays = p.numRays;
    this.maxRayLength = p.maxRayLength;
    this.x = x;
    this.y = y;
    this.maxVelocity = p.maxVelocity;
    this.ns = new SensorCTRNN(net);
    this.rays = Array.from({ length: p.numRays }, () => ({ x1: 0, y1: 0, x2: 0, y2: 0, angle: 0, length: 0, relX: 0, relY: 0 }));
    this.resetRays();
  }

  resetRays(): void {
    const thetas = linspace(-this.visualAngle / 2, this.visualAngle / 2, this.numRays);
    thetas.forEach((theta, i) => {
      const ray = this.rays[i];
      ray.angle = theta;
      ray.relX = this.radius * Math.sin(theta) + this.maxRayLength * Math.sin(theta);
      ray.x2 = this.x + ray.relX;
      ray.relY = this.radius * Math.cos(theta) + this.maxRayLength * Math.cos(theta);
      ray.y2 = this.y - ray.relY;
      ray.x1 = this.x + this.radius * Math.sin(theta);
      ray.y1 = this.y - this.radius * Math.cos(theta);
      const dx = ray.x2 - ray.x1, dy = ray.y2 - ray.y1;
      ray.length = Math.sqrt(dx * dx + dy * dy);
    });
  }

  setPosition(x: number, y: number): void {
    for (const ray of this.rays) {
      ray.x2 += x - this.x;
      ray.x1 += x - this.x;
      ray.y2 += y - this.y;
      ray.y1 += y - this.y;
    }
    this.x = x;
    this.y = y;
  }

  clipPosition(left: number, right: number): void {
    if (this.x - this.radius < left) {
      const dx = left - this.x + this.radius;
      this.x = left + this.radius;
      for (const ray of this.rays) { ray.x1 += dx; ray.x2 += dx; }
    } else if (this.x + this.radius > right) {
      const dx = this.x + this.radius - right;
      this.x = right - this.radius;
      for (const ray of this.rays) { ray.x1 -= dx; ray.x2 -= dx; }
    }
  }

  initializeRaySensors(obj: Circle): void {
    for (const ray of this.rays) {
      ray.x2 = this.x + ray.relX;
      ray.y2 = this.y - ray.relY;
    }
    for (const ray of this.rays) {
      obj.rayIntersection(ray);
      const dx = ray.x2 - ray.x1, dy = ray.y2 - ray.y1;
      ray.length = Math.sqrt(dx * dx + dy * dy);
    }
    this.rays.forEach((ray, i) => { this.ns.sensors[i] = (this.maxRayLength - ray.length) / this.maxRayLength; });
  }

  step(dt: number, locked: boolean): void {
    this.ns.eulerStep(dt);
    const n = this.ns.net.size;
    const left = locked ? 0 : this.ns.outputs[n - 2];
    const right = locked ? 0 : this.ns.outputs[n - 1];
    this.vx = (left - right) / this.mass;
    if (this.vx < -this.maxVelocity) this.vx = -this.maxVelocity;
    if (this.vx > this.maxVelocity) this.vx = this.maxVelocity;
    this.setPosition(this.x + dt * this.vx, this.y);
  }
}

export type StepHook = (agent: SensorAgent, ball: Circle, phase: 1 | 2) => void;

/** RelationalCategorization.trial: returns the trial score (1 - d to catch, d to avoid). */
export function runTrial(p: RelcatParams, agent: SensorAgent, first: number, second: number, onStep?: StepHook): { score: number; finalDx: number } {
  const ix = (p.worldRight - p.worldLeft) / 2, iy = p.worldBottom - p.agentRadius;
  agent.setPosition(ix, iy);
  agent.resetRays();
  agent.ns.initialize();
  agent.vx = 0;
  const ball = new Circle(20, ix, p.worldTop, 0, p.objVelocity);
  ball.cx = ix;
  ball.cy = iy - (agent.radius + agent.maxRayLength + first);
  ball.size = first / 2;
  agent.initializeRaySensors(ball);
  while (ball.leadingEdgeY() < agent.y - agent.radius) {
    ball.step(p.stepSize);
    agent.initializeRaySensors(ball);
    agent.step(p.stepSize, true);
    onStep?.(agent, ball, 1);
  }
  ball.cx = ix;
  ball.cy = iy - (agent.radius + agent.maxRayLength + second);
  ball.size = second / 2;
  agent.resetRays();
  while (ball.leadingEdgeY() < agent.y - agent.radius) {
    ball.step(p.stepSize);
    agent.initializeRaySensors(ball);
    agent.step(p.stepSize, false);
    agent.clipPosition(p.worldLeft, p.worldRight);
    onStep?.(agent, ball, 2);
  }
  let d = Math.abs(ball.cx - agent.x) / p.maxDistance;
  if (d > 1) d = 1;
  return { score: first > second ? 1 - d : d, finalDx: agent.x - ball.cx };
}

/** Sizes used by run_trials: i * difference + min for i < max / difference (as in relcat). */
export function trialSizes(p: RelcatParams): number[] {
  const n = Math.trunc(p.circleMaxDiameter / p.circleDifference);
  return Array.from({ length: n }, (_, i) => i * p.circleDifference + p.circleMinDiameter);
}

/** RelationalCategorization.eval_fitness over the score matrix m[i][j] (first size i, second size j). */
export function evalFitness(m: number[][]): number {
  const N = m.length;
  let colAvg = 0, rowAvg = 0;
  for (let i = 1; i < N - 1; i++) {
    let colSum = 0, rowSum = 0, num = 0;
    for (let j = 0; j < N; j++) {
      if (i === j) {
        colAvg += colSum / num;
        rowAvg += rowSum / num;
        colSum = 0; rowSum = 0; num = 0;
      } else {
        num++;
        colSum += m[j][i];
        rowSum += m[i][j];
      }
    }
    colAvg += colSum / num;
    rowAvg += rowSum / num;
  }
  return Math.min(colAvg / (N - 2) / 2, rowAvg / (N - 2) / 2);
}

/** Full fitness of a network (run_trials). */
export function relcatFitness(p: RelcatParams, net: RelcatNet): number {
  const sizes = trialSizes(p), N = sizes.length;
  const agent = new SensorAgent(p, net, (p.worldRight - p.worldLeft) / 2, p.worldBottom - p.agentRadius);
  const m = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) m[i][j] = runTrial(p, agent, sizes[i], sizes[j]).score;
  return evalFitness(m);
}

// ------------------------------------------------------------------ genome (map_search_parameters)

/** periodic_boundary_conditions(value, 1) followed by rescale_parameter onto [min, max] (search range [0, 1]). */
function mapGene(v: number, min: number, max: number): number {
  const m = ((v % 2) + 2) % 2; // Python's modulo (sign of the divisor)
  const pbc = 1 - Math.abs(m - 1);
  return (max - min) * pbc + min;
}

export function genomeSize(p: RelcatParams, symmetric: boolean): number {
  const ni = p.numInterneurons, nr = p.numRays, cs = ni + 2;
  if (!symmetric) return ni * nr + ni * (ni + 2) + cs + cs;
  const nsw = nr % 2 === 0 ? (nr / 2) * ni : ((nr - 1) / 2) * ni + Math.ceil(ni / 2);
  const ncw = ni + Math.ceil(ni / 2) + Math.trunc(ni / 2) ** 2 + Math.ceil(ni / 2) * (Math.ceil(ni / 2) - 1);
  return nsw + ncw + Math.ceil(ni / 2) + Math.ceil(ni / 2) + 2;
}

export function decodeNet(x: ArrayLike<number>, p: RelcatParams, symmetric: boolean): RelcatNet {
  const ni = p.numInterneurons, nr = p.numRays, cs = ni + 2;
  const sw = new Array(nr * cs).fill(0), W = new Array(cs * cs).fill(0);
  const biases = new Array(cs).fill(0), taus = new Array(cs).fill(1), gains = new Array(cs).fill(1);
  const S = (r: number, j: number, v: number) => { sw[r * cs + j] = v; };
  const C = (i: number, j: number, v: number) => { W[i * cs + j] = v; };
  if (!symmetric) {
    let k = 0;
    const sEnd = ni * nr, cEnd = sEnd + ni * (ni + 2), bEnd = cEnd + cs;
    for (let i = 0; i < nr; i++) for (let j = 0; j < ni; j++) S(i, j, mapGene(x[ni * i + j], p.minWeight, p.maxWeight));
    k = sEnd;
    for (let i = 0; i < ni; i++) for (let j = 0; j < ni; j++) C(i, j, mapGene(x[k + ni * i + j], p.minWeight, p.maxWeight));
    for (let i = 0; i < ni; i++) for (let j = 0; j < 2; j++) C(i, ni + j, mapGene(x[k + ni * ni + 2 * i + j], p.minWeight, p.maxWeight));
    for (let i = 0; i < cs; i++) biases[i] = mapGene(x[cEnd + i], p.minBias, p.maxBias);
    for (let i = 0; i < cs; i++) taus[i] = mapGene(x[bEnd + i], p.minTau, p.maxTau);
  } else {
    const nsw = nr % 2 === 0 ? (nr / 2) * ni : ((nr - 1) / 2) * ni + Math.ceil(ni / 2);
    const ncw = ni + Math.ceil(ni / 2) + Math.trunc(ni / 2) ** 2 + Math.ceil(ni / 2) * (Math.ceil(ni / 2) - 1);
    const sEnd = nsw, cEnd = sEnd + ncw, bEnd = cEnd + Math.ceil(cs / 2);
    let k = 0;
    const sv = (idx: number) => mapGene(x[idx], p.minWeight, p.maxWeight);
    for (let i = 0; i < Math.trunc(nr / 2); i++)
      for (let j = 0; j < ni; j++) { S(i, j, sv(k)); S(nr - i - 1, ni - j - 1, sv(k)); k++; }
    if (nr % 2 === 1)
      for (let j = 0; j < Math.ceil(ni / 2); j++) { S(Math.trunc(nr / 2), j, sv(k)); S(Math.trunc(nr / 2), ni - j - 1, sv(k)); k++; }
    let c = 0;
    const cv = (idx: number) => mapGene(x[sEnd + idx], p.minWeight, p.maxWeight);
    for (let i = 0; i < Math.trunc(ni / 2); i++)
      for (let j = 0; j < ni; j++) { C(i, j, cv(c)); C(ni - i - 1, ni - j - 1, cv(c)); c++; }
    if (ni % 2 === 1)
      for (let j = 0; j < Math.ceil(ni / 2); j++) { C(Math.trunc(ni / 2), j, cv(c)); C(Math.trunc(ni / 2), ni - j - 1, cv(c)); c++; }
    for (let i = 0; i < Math.trunc(ni / 2); i++)
      for (let j = 0; j < 2; j++) { C(i, ni + j, cv(c)); C(ni - i - 1, cs - j - 1, cv(c)); c++; }
    if (ni % 2 === 1) { C(Math.trunc(ni / 2), ni, cv(c)); C(Math.trunc(ni / 2), cs - 1, cv(c)); c++; }
    // Biases: one per mirror pair of interneurons, plus one shared by the motor neurons (the last bias gene)
    const bpars = Array.from({ length: bEnd - cEnd }, (_, q) => mapGene(x[cEnd + q], p.minBias, p.maxBias));
    for (let i = 0; i < Math.ceil(ni / 2); i++) { biases[i] = bpars[i]; biases[ni - i - 1] = bpars[i]; }
    biases[cs - 2] = bpars[bpars.length - 1];
    biases[cs - 1] = bpars[bpars.length - 1];
    const tpars = Array.from({ length: x.length - bEnd }, (_, q) => mapGene(x[bEnd + q], p.minTau, p.maxTau));
    for (let i = 0; i < Math.ceil(ni / 2); i++) { taus[i] = tpars[i]; taus[ni - i - 1] = tpars[i]; }
    taus[cs - 2] = tpars[tpars.length - 1];
    taus[cs - 1] = tpars[tpars.length - 1];
  }
  return { size: cs, numRays: nr, sensorWeights: sw, weights: W, biases, gains, taus };
}
