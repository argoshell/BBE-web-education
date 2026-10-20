// Port of the visual categorization agent (VisualAgent.cpp, VisualObject.h; Matthew Setzler's
// implementation of Beer 2003 in EvolutionaryAgents v1.2). Indices are 0-based.
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

export class VisualAgent {
  cx = 0;
  cy = 0;
  vx = 0;
  nervousSystem: CTRNN;
  rays: Ray[] = Array.from({ length: NumRays }, () => ({ m: 0, b: 0, startX: 0, startY: 0, length: MaxRayLength }));

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
    let theta = -VisualAngle / 2;
    for (let i = 0; i < NumRays; i++) {
      resetRay(this.rays[i], theta, this.cx, this.cy);
      theta += VisualAngle / (NumRays - 1);
    }
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
