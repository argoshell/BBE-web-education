// Port of the visual categorization agent (VisualAgent.cpp, VisualObject.h; Matthew Setzler's
// implementation of Beer 2003 in EvolutionaryAgents v1.2), plus the variant used by Izquierdo's
// VisuallyGuidedAgent tasks (GuidedAgent, Aperture; bottom of file). Indices are 0-based.
//
// The agent sits at y = 0 and moves horizontally. Seven rays fan upward over a 30° visual
// angle; each ray's input to sensory neuron i is InputGain * (MaxRayLength - length) / MaxRayLength.
// Neurons 13 and 14 (indices 12, 13) drive velocity: vx = VelGain * (o13 - o14).

import { CTRNN } from '../../core/ctrnn';
import type { RandomState } from '../../core/random';

export const Pi = 3.1415926535897;
export const BodySize = 30.0;
export const EnvWidth = 400.0;
export const MaxRayLength = 220.0;
export const InputGain = 10.0;
export const VisualAngle = Pi / 6;
export const VelGain = 5;
export const NumRays = 7;

export interface Ray {
  m: number;
  b: number;
  startX: number;
  startY: number;
  length: number;
}

export type ObjectShape = 'circle' | 'line';

export class VisualObject {
  shape: ObjectShape;
  cx: number;
  cy: number;
  vy: number;
  size: number;

  constructor(shape: ObjectShape, ix = 0.0, iy = 275.0, vy = -3.0, size = 30.0) {
    this.shape = shape;
    this.cx = ix;
    this.cy = iy;
    this.vy = vy;
    this.size = size;
  }

  step(dt: number): void {
    this.cy += dt * this.vy;
  }

  /** Shorten the ray if it hits this object (assumes the agent looks up at it). */
  rayIntersection(ray: Ray): void {
    if (this.shape === 'line') this.lineIntersection(ray);
    else this.circleIntersection(ray);
  }

  private lineIntersection(ray: Ray): void {
    const xIntersect = ray.m === Infinity ? ray.startX : (this.cy - ray.b) / ray.m;
    if (Math.abs(this.cx - xIntersect) > this.size / 2.0 || this.cy < 0) return;
    const newLength = Math.sqrt((xIntersect - ray.startX) ** 2 + (this.cy - ray.startY) ** 2);
    if (newLength < ray.length) ray.length = newLength;
  }

  private circleIntersection(ray: Ray): void {
    const { cx, cy, size } = this;
    if (ray.m === Infinity) {
      if (Math.abs(ray.startX - cx) > size / 2) return;
      const xIntersect = ray.startX;
      const A = 1;
      const B = -2 * cy;
      const C = cy ** 2 - (size / 2) ** 2 + (xIntersect - cx) ** 2;
      const disc = B ** 2 - 4 * A * C;
      const yIntersect = (-B - Math.sqrt(disc)) / (2 * A);
      const newLength = Math.abs(yIntersect - ray.startY);
      if (newLength < ray.length) ray.length = newLength;
      return;
    }
    const A = 1 + ray.m ** 2;
    const B = 2 * (ray.m * (ray.b - cy) - cx);
    const C = cx ** 2 + ray.b ** 2 - 2 * ray.b * cy + cy ** 2 - (size / 2) ** 2;
    const disc = B ** 2 - 4 * A * C;
    if (disc < 0) return;
    const x1 = (-B + Math.sqrt(disc)) / (2 * A);
    const y1 = ray.m * x1 + ray.b;
    const d1 = Math.sqrt((x1 - ray.startX) ** 2 + (y1 - ray.startY) ** 2);
    const x2 = (-B - Math.sqrt(disc)) / (2 * A);
    const y2 = ray.m * x2 + ray.b;
    const d2 = Math.sqrt((x2 - ray.startX) ** 2 + (y2 - ray.startY) ** 2);
    const newLength = d1 < d2 ? d1 : d2;
    if (newLength < ray.length) ray.length = newLength;
  }
}

function resetRay(ray: Ray, theta: number, cx: number, cy: number): void {
  if (Math.abs(theta) < 0.0000001) ray.m = Infinity;
  else ray.m = 1 / Math.tan(theta);
  ray.b = cy - ray.m * cx;
  ray.length = MaxRayLength;
  if (ray.m === Infinity) {
    ray.startX = cx;
    ray.startY = cy + BodySize / 2;
    return;
  }
  ray.startX = cx + (BodySize / 2) * Math.sin(theta);
  ray.startY = cy + (BodySize / 2) * Math.cos(theta);
}

/** Fan the rays evenly over the visual angle, as VisualAgent::ResetRays does. */
export function resetRays(rays: Ray[], cx: number, cy: number): void {
  const n = rays.length;
  let theta = -VisualAngle / 2;
  for (let i = 0; i < n; i++) {
    resetRay(rays[i], theta, cx, cy);
    theta += VisualAngle / (n - 1);
  }
}

export function makeRays(n: number): Ray[] {
  return Array.from({ length: n }, () => ({ m: 0, b: 0, startX: 0, startY: 0, length: MaxRayLength }));
}

export class VisualAgent {
  cx = 0;
  cy = 0;
  vx = 0;
  nervousSystem: CTRNN;
  rays: Ray[] = makeRays(NumRays);

  constructor(ns: CTRNN) {
    this.nervousSystem = ns;
  }

  setPositionX(x: number): void {
    this.cx = x;
    this.resetRays();
  }

  reset(rs: RandomState, ix: number, iy: number, randomize: boolean): void {
    this.cx = ix;
    this.cy = iy;
    this.vx = 0;
    if (randomize) this.nervousSystem.randomizeCircuitState(-0.1, 0.1, rs);
    else this.nervousSystem.randomizeCircuitState(0.0, 0.0, rs);
    this.resetRays();
  }

  resetRays(): void {
    resetRays(this.rays, this.cx, this.cy);
  }

  step(dt: number, object: VisualObject): void {
    this.resetRays();
    const ns = this.nervousSystem;
    for (let i = 0; i < NumRays; i++) {
      object.rayIntersection(this.rays[i]);
      ns.externalInputs[i] = (InputGain * (MaxRayLength - this.rays[i].length)) / MaxRayLength;
    }
    ns.eulerStep(dt);
    this.vx = VelGain * (ns.outputs[12] - ns.outputs[13]);
    this.cx = this.cx + dt * this.vx;
    if (this.cx < -EnvWidth / 2) this.cx = -EnvWidth / 2;
    else if (this.cx > EnvWidth / 2) this.cx = EnvWidth / 2;
  }
}

// ---------------------------------------------------------------------------------------------
// Variant from Eduardo Izquierdo's VisuallyGuidedAgent (with Randall Beer and Matthew Setzler;
// github.com/edizquierdo/VisuallyGuidedAgent). Geometry and objects are the same, but the rays
// are not neurons: each ray's input, (MaxRayLength - length) / MaxRayLength, feeds the interneurons
// through a sensor weight matrix. The CTRNN holds only the interneurons and the two motor neurons,
// and vx = GuidedVelGain * (o[M1] - o[M2]). (Its VisualObject also has a heading angle, always 0 in
// the tasks, which makes its Step identical to the one above.)

export const GuidedInputGain = 1.0;
export const GuidedVelGain = 8.0;

/** Anything the rays can hit. */
export interface Sensed {
  rayIntersection(ray: Ray): void;
}

/**
 * Izquierdo's affordance stimulus: two horizontal line segments (each `segment` wide) falling
 * together and leaving a gap of width `gap` centered at `center`.
 */
export class Aperture implements Sensed {
  left: VisualObject;
  right: VisualObject;
  gap: number;
  center: number;

  constructor(center: number, gap: number, iy: number, vy = -3.0, segment = 30.0) {
    this.center = center;
    this.gap = gap;
    this.right = new VisualObject('line', gap / 2 + segment / 2.0 + center, iy, vy, segment);
    this.left = new VisualObject('line', -(gap / 2) - segment / 2.0 + center, iy, vy, segment);
  }

  get cy(): number {
    return this.left.cy;
  }

  step(dt: number): void {
    this.left.step(dt);
    this.right.step(dt);
  }

  rayIntersection(ray: Ray): void {
    this.left.rayIntersection(ray);
    this.right.rayIntersection(ray);
  }
}

export class GuidedAgent {
  cx = 0;
  cy = 0;
  vx = 0;
  readonly numRays: number;
  readonly numInter: number;
  nervousSystem: CTRNN;
  /** Row-major by ray: sensorWeights[ray * numInter + inter]. */
  sensorWeights: Float64Array;
  /** Ray inputs used on the last step. */
  inputs: Float64Array;
  rays: Ray[];

  constructor(ns: CTRNN, sensorWeights: ArrayLike<number>, numRays: number, numInter: number) {
    this.nervousSystem = ns;
    this.numRays = numRays;
    this.numInter = numInter;
    this.sensorWeights = Float64Array.from(sensorWeights);
    this.inputs = new Float64Array(numRays);
    this.rays = makeRays(numRays);
  }

  setPositionX(x: number): void {
    this.cx = x;
    this.resetRays();
  }

  /** Reset(ix, iy, 0): neuron states set to 0 (RandomizeCircuitState(0, 0)). */
  reset(ix: number, iy: number): void {
    this.cx = ix;
    this.cy = iy;
    this.vx = 0;
    const ns = this.nervousSystem;
    for (let i = 0; i < ns.size; i++) ns.setNeuronState(i, 0.0);
    this.resetRays();
  }

  resetRays(): void {
    resetRays(this.rays, this.cx, this.cy);
  }

  /** Step (one object) or Step2 (two objects, e.g. an aperture's lines). */
  step(dt: number, objects: readonly Sensed[]): void {
    this.resetRays();
    const ns = this.nervousSystem, nr = this.numRays, ni = this.numInter, sw = this.sensorWeights;
    for (let i = 0; i < nr; i++) {
      for (const o of objects) o.rayIntersection(this.rays[i]);
      this.inputs[i] = (GuidedInputGain * (MaxRayLength - this.rays[i].length)) / MaxRayLength;
    }
    for (let j = 0; j < ni; j++) {
      let net = 0.0;
      for (let i = 0; i < nr; i++) net += sw[i * ni + j] * this.inputs[i];
      ns.externalInputs[j] = net;
    }
    ns.eulerStep(dt);
    const n = ns.size;
    this.vx = GuidedVelGain * (ns.outputs[n - 2] - ns.outputs[n - 1]);
    this.cx = this.cx + dt * this.vx;
    if (this.cx < -EnvWidth / 2) this.cx = -EnvWidth / 2;
    else if (this.cx > EnvWidth / 2) this.cx = EnvWidth / 2;
  }
}
