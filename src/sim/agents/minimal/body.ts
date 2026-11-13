// The visually guided agent of Beer's "minimally cognitive behavior" experiments (Beer 1996;
// Slocum, Downey & Beer 2000; Goldenberg, Garcowski & Beer 2004): a circular agent of diameter 30
// moving horizontally along the bottom of a 400-wide world, with an eye of proximity rays fanned
// over a visual angle, watching circles fall. No code was published for these experiments; the body
// reuses the geometry of Beer's VisualAgent.cpp (ported and tested in ../visual/body.ts), with the
// number of rays, their length and the velocity gain set per experiment.
//
// The CTRNN holds the ray sensory neurons (indices 0..S-1, left to right), then the interneurons,
// then two motor neurons; vx = velGain · (o[M1] − o[M2]), as in VisualAgent.cpp. Each ray injects
// InputGain · (L − length) / L into its sensory neuron: 0 at full length, 10 at contact.

import { CTRNN } from '../../core/ctrnn';
import { RandomState } from '../../core/random';
import { InputGain, VisualObject, type Ray } from '../visual/body';

export const BODY_SIZE = 30;
export const ENV_WIDTH = 400;
export const ENV_HEIGHT = 275;
export const OBJECT_SIZE = 26;

export interface Eye {
  rays: number;
  length: number;
  angle: number;
}

/** A falling circle with a horizontal velocity; horizontal motion stops at the walls (Beer 1996). */
export class MovingCircle extends VisualObject {
  vx: number;
  constructor(x: number, y: number, vx: number, vy: number, size = OBJECT_SIZE) {
    super('circle', x, y, vy, size);
    this.vx = vx;
  }

  override step(dt: number): void {
    this.cy += dt * this.vy;
    this.cx += dt * this.vx;
    if (this.cx < -ENV_WIDTH / 2) this.cx = -ENV_WIDTH / 2;
    else if (this.cx > ENV_WIDTH / 2) this.cx = ENV_WIDTH / 2;
  }
}

function resetRay(ray: Ray, theta: number, cx: number, cy: number, length: number): void {
  // As VisualAgent::ResetRay, with the ray length as a parameter
  if (Math.abs(theta) < 0.0000001) ray.m = Infinity;
  else ray.m = 1 / Math.tan(theta);
  ray.b = cy - ray.m * cx;
  ray.length = length;
  if (ray.m === Infinity) {
    ray.startX = cx;
    ray.startY = cy + BODY_SIZE / 2;
    return;
  }
  ray.startX = cx + (BODY_SIZE / 2) * Math.sin(theta);
  ray.startY = cy + (BODY_SIZE / 2) * Math.cos(theta);
}

/** Ray i's angle from vertical (negative = left). */
export function rayAngle(eye: Eye, i: number): number {
  return eye.rays === 1 ? 0 : -eye.angle / 2 + (i * eye.angle) / (eye.rays - 1);
}

export class ProximityAgent {
  cx = 0;
  cy = 0;
  vx = 0;
  eye: Eye;
  velGain: number;
  nervousSystem: CTRNN;
  rays: Ray[];
  /** When set, the sensors read 0 (the short-term memory task blinds a moving agent). */
  blind = false;

  constructor(ns: CTRNN, eye: Eye, velGain: number) {
    this.nervousSystem = ns;
    this.eye = eye;
    this.velGain = velGain;
    this.rays = Array.from({ length: eye.rays }, () => ({ m: 0, b: 0, startX: 0, startY: 0, length: eye.length }));
  }

  reset(x: number): void {
    this.cx = x;
    this.cy = 0;
    this.vx = 0;
    this.blind = false;
    this.nervousSystem.randomizeCircuitState(0, 0, new RandomState(1));
    this.resetRays();
  }

  resetRays(): void {
    this.rays.forEach((r, i) => resetRay(r, rayAngle(this.eye, i), this.cx, this.cy, this.eye.length));
  }

  /** Sense the objects, integrate the network one step, move. */
  step(dt: number, objects: VisualObject[]): void {
    this.resetRays();
    const ns = this.nervousSystem, L = this.eye.length;
    for (let i = 0; i < this.rays.length; i++) {
      for (const o of objects) o.rayIntersection(this.rays[i]);
      ns.externalInputs[i] = this.blind ? 0 : (InputGain * (L - this.rays[i].length)) / L;
    }
    ns.eulerStep(dt);
    const m = ns.size - 2;
    this.vx = this.velGain * (ns.outputs[m] - ns.outputs[m + 1]);
    this.cx += dt * this.vx;
    if (this.cx < -ENV_WIDTH / 2) this.cx = -ENV_WIDTH / 2;
    else if (this.cx > ENV_WIDTH / 2) this.cx = ENV_WIDTH / 2;
  }

  /** Lengths the rays would have now (for display). */
  rayLengths(objects: VisualObject[]): number[] {
    this.resetRays();
    return this.rays.map((r) => { const c = { ...r }; for (const o of objects) o.rayIntersection(c); return c.length; });
  }

  /** Whether any ray currently touches the object. */
  sees(o: VisualObject): boolean {
    this.resetRays();
    return this.rays.some((r) => { const c = { ...r }; o.rayIntersection(c); return c.length < this.eye.length; });
  }
}

export interface Fall {
  x: number;
  vx: number;
  vy: number;
  y?: number;
}

export interface TrialOptions {
  /** Short-term memory: the sensors switch off once the agent has moved this far from its start. */
  blindAfter?: number;
  /** Start height of the objects (default: the top of the 275-high world). */
  startY?: number;
}

export interface TrialOutcome {
  /** Agent x − object x when each object landed, in order of the objects given. */
  dx: number[];
  /** Time each object landed. */
  landT: number[];
  /** Time the agent went blind (memory task), or NaN. */
  blindT: number;
}

export type StepHook = (a: ProximityAgent, objects: MovingCircle[], active: boolean[], t: number) => void;

/**
 * One trial. The loop follows runTrial for the C++ visual agent: step the agent, then the objects,
 * while an object is above the agent's top (y > BodySize/2). A landed object is removed, so it no
 * longer blocks the rays (Goldenberg et al. 2004).
 */
export function runFalls(ns: CTRNN, eye: Eye, velGain: number, falls: Fall[], dt: number, opts: TrialOptions = {}, onStep?: StepHook): TrialOutcome {
  const a = new ProximityAgent(ns, eye, velGain);
  a.reset(0);
  const objs = falls.map((f) => new MovingCircle(f.x, f.y ?? opts.startY ?? ENV_HEIGHT, f.vx, f.vy));
  const active = objs.map(() => true);
  const out: TrialOutcome = { dx: objs.map(() => NaN), landT: objs.map(() => NaN), blindT: NaN };
  onStep?.(a, objs, active, 0);
  let t = 0;
  for (; active.some(Boolean); t += dt) {
    a.step(dt, objs.filter((_, k) => active[k]));
    if (opts.blindAfter !== undefined && !a.blind && Math.abs(a.cx) >= opts.blindAfter) { a.blind = true; out.blindT = t + dt; }
    objs.forEach((o, k) => {
      if (!active[k]) return;
      o.step(dt);
      if (o.cy <= BODY_SIZE / 2) { active[k] = false; out.dx[k] = a.cx - o.cx; out.landT[k] = t + dt; }
    });
    onStep?.(a, objs, active, t + dt);
  }
  return out;
}
