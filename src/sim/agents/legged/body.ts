// Port of Beer's LeggedAgent (LeggedAgent.cpp): a single-legged insect body.
// Body constants are parameters here so they can be explored in the UI; the defaults
// reproduce the original constants exactly (including the truncated Pi).

import { CTRNN } from '../../core/ctrnn';
import type { RandomState } from '../../core/random';

export const Pi = 3.1415926;

export interface LegBodyParams {
  legLength: number;
  maxLegForce: number;
  forwardAngleLimit: number;
  backwardAngleLimit: number;
  maxVelocity: number;
  maxTorque: number;
  maxOmega: number;
  /** Height of the leg joint above the body's reference point. */
  jointHeight: number;
  /** Body becomes unstable when the foot is this far behind the body. */
  instabilityDistance: number;
}

export const defaultBody: LegBodyParams = {
  legLength: 15,
  maxLegForce: 0.05,
  forwardAngleLimit: Pi / 6,
  backwardAngleLimit: -Pi / 6,
  maxVelocity: 6.0,
  maxTorque: 0.5,
  maxOmega: 1.0,
  jointHeight: 12.5,
  instabilityDistance: 20,
};

/**
 * Controller variants:
 * - cpg:     LeggedAgent::Step. N >= 3; neuron 1 foot (>0.5 = down), 2 forward, 3 backward.
 * - two:     LeggedAgent::Step2. N >= 2; neuron 1 foot and forward force, 2 backward.
 * - one:     LeggedAgent::Step1. N >= 1; neuron 1 drives everything, input = angle * 5/limit.
 * - sensor:  Step plus a leg-angle sensor: I_i = s_i * angle / forwardAngleLimit (new).
 * - perfect: LeggedAgent::PerfectStep, the hand-designed optimal pattern (no neurons).
 */
export type ControllerKind = 'cpg' | 'two' | 'one' | 'sensor' | 'perfect';

export class Leg {
  angle = 0;
  omega = 0;
  forwardForce = 0;
  backwardForce = 0;
  footX = 0;
  footY = 0;
  jointX = 0;
  jointY = 0;
  footState = 0;
}

export class LeggedAgent {
  cx = 0;
  cy = 0;
  vx = 0;
  leg = new Leg();
  nervousSystem: CTRNN;
  body: LegBodyParams;
  /** Sensor weights for the 'sensor' controller, one per neuron. */
  sensorWeights: Float64Array;

  constructor(ns: CTRNN = new CTRNN(0), body: LegBodyParams = defaultBody) {
    this.nervousSystem = ns;
    this.body = body;
    this.sensorWeights = new Float64Array(ns.size);
  }

  /** LeggedAgent::Reset. Note that rs is consumed even when randomize is false. */
  reset(ix: number, iy: number, randomize: boolean, rs: RandomState): void {
    const b = this.body, leg = this.leg;
    this.cx = ix;
    this.cy = iy;
    this.vx = 0.0;
    leg.footState = 0;
    if (randomize) leg.angle = rs.uniformRandom(b.backwardAngleLimit, b.forwardAngleLimit);
    else leg.angle = b.forwardAngleLimit;
    leg.omega = leg.forwardForce = leg.backwardForce = 0.0;
    leg.jointX = this.cx;
    leg.jointY = this.cy + b.jointHeight;
    leg.footX = leg.jointX + b.legLength * Math.sin(leg.angle);
    leg.footY = leg.jointY + b.legLength * Math.cos(leg.angle);
    if (randomize) this.nervousSystem.randomizeCircuitState(-0.1, 0.1, rs);
    else this.nervousSystem.randomizeCircuitState(0.0, 0.0, rs);
  }

  step(kind: ControllerKind, dt: number): void {
    switch (kind) {
      case 'cpg': return this.stepCpg(dt);
      case 'two': return this.step2(dt);
      case 'one': return this.step1(dt);
      case 'sensor': return this.stepSensor(dt);
      case 'perfect': return this.perfectStep(dt);
    }
  }

  /** LeggedAgent::Step — general CTRNN CPG. */
  stepCpg(dt: number): void {
    const ns = this.nervousSystem, leg = this.leg, b = this.body;
    ns.eulerStep(dt);
    if (ns.outputs[0] > 0.5) { leg.footState = 1; leg.omega = 0; }
    else leg.footState = 0;
    leg.forwardForce = ns.outputs[1] * b.maxLegForce;
    leg.backwardForce = ns.outputs[2] * b.maxLegForce;
    this.move(dt, this.supportForce(), leg.backwardForce - leg.forwardForce);
  }

  /** Step plus leg-angle sensory feedback to every neuron. */
  stepSensor(dt: number): void {
    const ns = this.nervousSystem;
    const a = this.leg.angle / this.body.forwardAngleLimit;
    for (let i = 0; i < ns.size; i++) ns.externalInputs[i] = this.sensorWeights[i] * a;
    this.stepCpg(dt);
  }

  /** LeggedAgent::Step2 — 2-neuron CPG. */
  step2(dt: number): void {
    const ns = this.nervousSystem, leg = this.leg, b = this.body;
    ns.eulerStep(dt);
    if (ns.outputs[0] > 0.5) { leg.footState = 1; leg.omega = 0; }
    else leg.footState = 0;
    leg.forwardForce = ns.outputs[0] * b.maxLegForce;
    leg.backwardForce = ns.outputs[1] * b.maxLegForce;
    this.move(dt, this.supportForce(), leg.backwardForce - leg.forwardForce);
  }

  /** LeggedAgent::Step1 — 1 neuron with leg-angle input. */
  step1(dt: number): void {
    const ns = this.nervousSystem, leg = this.leg, b = this.body;
    ns.externalInputs[0] = (leg.angle * 5.0) / b.forwardAngleLimit;
    ns.eulerStep(dt);
    const o = ns.outputs[0];
    if (o > 0.5) {
      leg.footState = 1;
      leg.omega = 0;
      leg.forwardForce = 2 * (o - 0.5) * b.maxLegForce;
    } else {
      leg.footState = 0;
      leg.backwardForce = 2 * (0.5 - o) * b.maxLegForce;
    }
    this.move(dt, this.supportForce(), leg.backwardForce - leg.forwardForce);
  }

  /** LeggedAgent::PerfectStep — the optimal pattern generator. */
  perfectStep(dt: number): void {
    const leg = this.leg, b = this.body;
    if (leg.footState === 0.0 && leg.angle >= b.forwardAngleLimit) { leg.footState = 1; leg.omega = 0; }
    else if (leg.footState === 1.0 && this.cx - leg.footX > b.instabilityDistance) leg.footState = 0;
    let force = 0.0;
    if (leg.footState === 1.0 && leg.angle >= b.backwardAngleLimit && leg.angle <= b.forwardAngleLimit)
      force = b.maxLegForce;
    this.move(dt, force, b.maxLegForce);
  }

  /**
   * Force on the body from a supporting leg. The angle limits act as one-way constraints
   * (the "new" body model in LeggedAgent.cpp).
   */
  private supportForce(): number {
    const leg = this.leg, b = this.body;
    const f = leg.forwardForce - leg.backwardForce;
    if (leg.footState === 1.0)
      if ((leg.angle >= b.backwardAngleLimit && leg.angle <= b.forwardAngleLimit) ||
          (leg.angle < b.backwardAngleLimit && f < 0) ||
          (leg.angle > b.forwardAngleLimit && f > 0))
        return f;
    return 0.0;
  }

  /** Body and leg kinematics shared by all step variants. */
  private move(dt: number, force: number, swingTorque: number): void {
    const leg = this.leg, b = this.body;
    this.vx = this.vx + dt * force;
    if (this.vx < -b.maxVelocity) this.vx = -b.maxVelocity;
    if (this.vx > b.maxVelocity) this.vx = b.maxVelocity;
    this.cx = this.cx + dt * this.vx;
    leg.jointX = leg.jointX + dt * this.vx;
    if (leg.footState === 1.0) {
      const angle = Math.atan2(leg.footX - leg.jointX, leg.footY - leg.jointY);
      leg.omega = (angle - leg.angle) / dt;
      leg.angle = angle;
    } else {
      this.vx = 0.0;
      leg.omega = leg.omega + dt * b.maxTorque * swingTorque;
      if (leg.omega < -b.maxOmega) leg.omega = -b.maxOmega;
      if (leg.omega > b.maxOmega) leg.omega = b.maxOmega;
      leg.angle = leg.angle + dt * leg.omega;
      if (leg.angle < b.backwardAngleLimit) { leg.angle = b.backwardAngleLimit; leg.omega = 0; }
      if (leg.angle > b.forwardAngleLimit) { leg.angle = b.forwardAngleLimit; leg.omega = 0; }
      leg.footX = leg.jointX + b.legLength * Math.sin(leg.angle);
      leg.footY = leg.jointY + b.legLength * Math.cos(leg.angle);
    }
    if (this.cx - leg.footX > b.instabilityDistance) this.vx = 0.0;
  }
}
