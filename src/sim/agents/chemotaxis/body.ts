// Port of Eduardo Izquierdo's C. elegans spatial-orientation model (WormAgent.cpp/.h from
// https://github.com/edizquierdo/CE_orientation; Izquierdo & Lockery 2010, Izquierdo & Beer 2013),
// which is built on Beer's CTRNN. The original has no license and is not redistributed here
// (scripts/fetch-izquierdo-sources.mjs). Neuron indices are 0-based (1-based in the C++).
//
// The model
// ---------
// Body: a point "head" at (px, py) moving at speed v along heading `orient`. Every step
//   orient += dt * theta,   theta = outputGain * (o_SMBV - o_SMBD)          (taxis mode)
//   (px, py) += dt * v * (cos orient, sin orient)
// so theta is the turning rate set by the two neck motor neurons. The speed rewards a regular
// undulation: over the last VelDelta = HST/dt steps (one head-sweep period, HST = 4.2 s),
//   v = MaxVel * (1 - |sum of ±dt for rising/falling theta| / HST)^2 * (1 - |0.7 - mean|theta||)^2,
// i.e. full speed (MaxVel = 0.022 cm/s) when theta rises and falls equally often and its mean
// magnitude is 0.7 rad/s; a worm that turns steadily one way or not at all slows down.
// In kinesis mode (unused by main.cpp's fitness) heading is not steered: the worm runs forward or
// backward at MaxVel, switching to backward when o_B > 0.6 and o_F < 0.4 and back to forward
// (with a uniformly random new heading) when o_B < 0.4 and o_F > 0.6.
//
// Environment: a cone-shaped attractant gradient centred on (0, 0):
//   C(x, y) = -gradSteep * sqrt(x^2 + y^2)
// (ChemDiffConst, a Gaussian "Ward 1973" profile, is declared but unused.) The worm starts at
// (-MaxDist, 0) = 4.5 cm from the peak.
//
// Sensors: ASE-like ON/OFF cells compare the mean concentration over the last N seconds with the
// mean over the M seconds before that (running sums over a concentration history):
//   d = mean(C, last N s) - mean(C, preceding M s);  ON (ASEL) = max(d, 0), OFF (ASER) = max(-d, 0)
// N and M are evolved (0.1–4.2 s).
//
// Nervous system: a CTRNN of `size` neurons (main.cpp: 10), gains 1, Euler integration.
//   0 .. size-5   interneurons; external input w_ASEL[i]*ON + w_ASER[i]*OFF
//   size-4        F (forward) and size-3 B (backward) motor neurons (only used in kinesis mode)
//   size-2        SMBV, size-1 SMBD: neck motor neurons, driven by an antiphase head-sweep
//                 oscillator: I_SMBV = w_cpg sin(HSP t), I_SMBD = w_cpg sin(Pi + HSP t), HSP = 2 Pi/HST
// Connections (SetParameters): interneurons fully recurrent; interneurons and F/B project to F/B;
// interneurons project to SMBV and SMBD with one shared weight each (dorsoventral symmetry);
// SMBV and SMBD have one shared self-connection; biases and time constants are shared by SMBV/SMBD.
//
// Order of operations per step (EvaluationFunction): UpdateSensors, Step, UpdateChemCon.
//
// Quirks of the original, all reproduced:
//  - ResetAgentsBody sets distanceToCentre = -MaxDist, so ResetChemCon fills the history with
//    +MaxDist*gradSteep before the first UpdateChemCon computes the (negative) true value. The
//    sensors therefore see a large concentration drop at the start of every orientation.
//  - Between repeats only the body is reset: neural state and sensor history carry over, and the
//    sensors see the jump from the end position back to the start.
//  - The head-sweep phase uses the loop time t, which restarts at dt in each loop (transient and
//    evaluation), so the oscillator jumps in phase between them.
//  - PushFront sums the whole speed-history window every step, oldest to newest; the port keeps that
//    summation order so it agrees with the C++ to rounding.
// Deviations:
//  - pastTheta is uninitialized in the C++ (undefined behavior on the first step); here it starts at 0.
//    The fixture harness sets it to 0 too (and the untouched EvaluationFunction gives the same result).
//  - VelDelta is HST/dt for the step size in use (the C++ fixes it at HST/StepSize = 420); identical
//    at the default dt = 0.01, and keeps the window one head-sweep long at other step sizes.
//  - The concentration history is sized to fit the run (the C++ exits if it overflows).

import { CTRNN, type CTRNNParams } from '../../core/ctrnn';
import type { RandomState } from '../../core/random';

export const StepSize = 0.01;
export const Pi = 3.1415926;
export const MaxDist = 4.5;
export const MaxVel = 0.022;
export const HST = 4.2;
export const HSP = (2 * Pi) / HST;

export interface WormParams {
  circuit: CTRNNParams;
  /** Sensory weights to each neuron (only interneurons 0..size-5 are used). */
  wASEL: number[];
  wASER: number[];
  /** Head-sweep oscillator weights onto SMBV and SMBD (main.cpp sets both from one gene). */
  wCpgV: number;
  wCpgD: number;
  /** Sensor integration windows (s): recent N, preceding M. */
  sensorN: number;
  sensorM: number;
  /** Gain from the neck motor-neuron difference to the turning rate. */
  outputGain: number;
}

export type WormMode = 'taxis' | 'kinesis';

/** Neuron roles for a circuit of the given size (0-based). */
export function wormRoles(size: number) {
  return { inter: Array.from({ length: size - 4 }, (_, i) => i), F: size - 4, B: size - 3, SMBV: size - 2, SMBD: size - 1 };
}

export class WormAgent {
  readonly size: number;
  readonly ns: CTRNN;
  readonly wASEL: Float64Array;
  readonly wASER: Float64Array;
  wCpgV: number;
  wCpgD: number;
  sensorN: number;
  sensorM: number;
  outputGain: number;

  iSensorN = 0;
  dSensorN = 0;
  iSensorM = 0;
  dSensorM = 0;
  velDelta = 0;
  /** chemConHistory; C++ index i is stored at i - 1. */
  private hist = new Float64Array(0);
  /** histCurv / histTheta as ring buffers; `head` is the newest entry. */
  private histCurv = new Float64Array(0);
  private histTheta = new Float64Array(0);
  private head = 0;
  timer = 0;

  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  orient = 0;
  distanceToCentre = 0;
  theta = 0;
  cpgOffset = 0;
  chemCon = 0;
  pastCon = 0;
  presentAvgCon = 0;
  pastAvgCon = 0;
  tempDiff = 0;
  oASEL = 0;
  oASER = 0;
  NMdiff = 0;
  pastTheta = 0;
  DthetaDt = 0;
  pushCurv = 0;
  avgtheta = 0;
  avgvel = 0;
  forward = 1;

  constructor(p: WormParams) {
    this.size = p.circuit.size;
    this.ns = CTRNN.fromParams(p.circuit);
    this.wASEL = Float64Array.from({ length: this.size }, (_, i) => p.wASEL[i] ?? 0);
    this.wASER = Float64Array.from({ length: this.size }, (_, i) => p.wASER[i] ?? 0);
    this.wCpgV = p.wCpgV;
    this.wCpgD = p.wCpgD;
    this.sensorN = p.sensorN;
    this.sensorM = p.sensorM;
    this.outputGain = p.outputGain;
  }

  /** InitialiseAgent: sensor windows in steps, cleared histories sized for `runDuration`. */
  initialiseAgent(runDuration: number, stepSize: number, extraSteps = 0): void {
    this.iSensorN = Math.trunc(this.sensorN / stepSize);
    this.dSensorN = this.iSensorN;
    this.iSensorM = Math.trunc(this.sensorM / stepSize);
    this.dSensorM = this.iSensorM;
    const upperbound = Math.trunc((runDuration + this.sensorN + this.sensorM) / stepSize) + 1;
    this.hist = new Float64Array(Math.max(upperbound, this.iSensorN + this.iSensorM + extraSteps + 4));
    this.velDelta = Math.max(1, Math.trunc(HST / stepSize));
    this.histCurv = new Float64Array(this.velDelta);
    this.histTheta = new Float64Array(this.velDelta);
    this.head = 0;
  }

  resetAgentsBody(neworient: number): void {
    this.distanceToCentre = -MaxDist;
    const tempangle = 0.0;
    this.px = Math.cos(tempangle) * this.distanceToCentre;
    this.py = Math.sin(tempangle) * this.distanceToCentre;
    this.vx = 0.0;
    this.vy = 0.0;
    this.theta = 0.0;
    this.orient = neworient;
    this.cpgOffset = 0.0;
    this.forward = 1;
  }

  resetChemCon(gradSteep: number): void {
    this.chemCon = -this.distanceToCentre * gradSteep;
    this.pastCon = this.chemCon;
    this.timer = this.iSensorN + this.iSensorM + 1;
    for (let i = 1; i <= this.timer; i++) this.hist[i - 1] = this.chemCon;
    this.presentAvgCon = this.chemCon * this.iSensorN;
    this.pastAvgCon = this.chemCon * this.iSensorM;
  }

  resetAgentIntState(rs: RandomState): void {
    this.ns.randomizeCircuitState(0.0, 0.0, rs);
  }

  updateChemCon(gradSteep: number): void {
    this.distanceToCentre = Math.sqrt(this.px * this.px + this.py * this.py);
    this.pastCon = this.chemCon;
    this.chemCon = -this.distanceToCentre * gradSteep;
    this.hist[this.timer - 1] = this.chemCon;
    this.timer += 1;
  }

  updateSensors(): void {
    const h = this.hist, t = this.timer, n = this.iSensorN, m = this.iSensorM;
    // C++: chemConHistory(timer - 1) etc. (1-based)
    this.presentAvgCon += h[t - 2] - h[t - n - 2];
    this.pastAvgCon += h[t - n - 2] - h[t - n - m - 2];
    this.tempDiff = this.presentAvgCon / this.dSensorN - this.pastAvgCon / this.dSensorM;
    this.oASEL = this.tempDiff > 0.0 ? this.tempDiff : 0.0;
    this.oASER = this.tempDiff < 0.0 ? Math.abs(this.tempDiff) : 0.0;
  }

  step(stepSize: number, rs: RandomState, timestep: number, mode: WormMode): void {
    const ns = this.ns, size = this.size, inp = ns.externalInputs;
    for (let i = 0; i < size - 4; i++) inp[i] = this.wASEL[i] * this.oASEL + this.wASER[i] * this.oASER;
    inp[size - 2] = this.wCpgV * Math.sin(this.cpgOffset + HSP * timestep);
    inp[size - 1] = this.wCpgD * Math.sin(this.cpgOffset + Pi + HSP * timestep);

    ns.eulerStep(stepSize);

    if (mode === 'taxis') {
      this.NMdiff = ns.outputs[size - 2] - ns.outputs[size - 1];
      this.theta = this.outputGain * this.NMdiff;
      this.orient += stepSize * this.theta;
      this.DthetaDt = this.theta - this.pastTheta;
      this.pastTheta = this.theta;
      this.pushCurv = this.DthetaDt > 0 ? stepSize : -stepSize;
      const [sumTheta, sumCurv] = this.pushHistories(Math.abs(this.theta), this.pushCurv);
      this.avgtheta = sumTheta / this.velDelta;
      const a = 1 - Math.abs(sumCurv) / HST, b = 1 - Math.abs(0.7 - this.avgtheta);
      this.avgvel = MaxVel * (a * a) * (b * b);
    } else {
      const oB = ns.outputs[size - 3], oF = ns.outputs[size - 4];
      if (this.forward === 1 && oB > 0.6 && oF < 0.4) this.forward = 0;
      if (this.forward === 0 && oB < 0.4 && oF > 0.6) {
        this.forward = 1;
        this.orient = rs.uniformRandom(0, 2 * Pi);
      }
      this.avgvel = this.forward === 0 ? -MaxVel : MaxVel;
    }

    this.vx = Math.cos(this.orient) * this.avgvel;
    this.vy = Math.sin(this.orient) * this.avgvel;
    this.px += stepSize * this.vx;
    this.py += stepSize * this.vy;
  }

  /**
   * TVector::PushFront on histTheta and histCurv: push the new value and return the window sum,
   * accumulated from the oldest entry to the newest exactly as the C++ loop does.
   */
  private pushHistories(th: number, curv: number): [number, number] {
    const L = this.velDelta, T = this.histTheta, C = this.histCurv;
    const p = this.head + 1 === L ? 0 : this.head + 1;
    this.head = p;
    T[p] = th;
    C[p] = curv;
    let st = 0.0, sc = 0.0;
    for (let i = p + 1; i < L; i++) { st += T[i]; sc += C[i]; }
    for (let i = 0; i < p; i++) { st += T[i]; sc += C[i]; }
    return [st + th, sc + curv];
  }
}

// ------------------------------------------------------------------ the evaluation protocol

export interface ProtocolSpec {
  orient: number;
  gradSteep: number;
  mode: WormMode;
  /** Runs from the start position without resetting the nervous system (main.cpp: 2). */
  repeats: number;
  transient: number;
  /** Duration of the scored part of each repeat (main.cpp: RunDuration - TransientDuration = 100). */
  evalDuration: number;
  dt: number;
}

export type StepCallback = (w: WormAgent, info: { repeat: number; evaluating: boolean; t: number; step: number }) => void;

/**
 * One orientation of main.cpp's EvaluationFunction: set up, then `repeats` runs of transient +
 * evaluation, each scored as max(0, (MaxDist - mean distance) / MaxDist). Returns the scores.
 */
export function runProtocol(w: WormAgent, s: ProtocolSpec, rs: RandomState, onStep?: StepCallback, onStart?: (w: WormAgent) => void): number[] {
  const dt = s.dt;
  const steps = Math.ceil((s.transient + s.evalDuration) / dt + 2) * s.repeats;
  // C++: InitialiseAgent(2 * RunDuration, StepSize)
  w.initialiseAgent(2 * (s.transient + s.evalDuration), dt, steps);
  w.resetAgentsBody(s.orient);
  w.resetChemCon(s.gradSteep);
  w.resetAgentIntState(rs);
  w.updateChemCon(s.gradSteep);
  onStart?.(w);
  const scores: number[] = [];
  let step = 0;
  for (let repeat = 0; repeat < s.repeats; repeat++) {
    w.resetAgentsBody(s.orient);
    for (let t = dt; t <= s.transient; t += dt) {
      w.updateSensors();
      w.step(dt, rs, t, s.mode);
      w.updateChemCon(s.gradSteep);
      step++;
      onStep?.(w, { repeat, evaluating: false, t, step });
    }
    let accdist = 0.0;
    for (let t = dt; t <= s.evalDuration; t += dt) {
      w.updateSensors();
      w.step(dt, rs, t, s.mode);
      w.updateChemCon(s.gradSteep);
      accdist += w.distanceToCentre;
      step++;
      onStep?.(w, { repeat, evaluating: true, t, step });
    }
    const totaldist = accdist / (s.evalDuration / dt);
    const f = (MaxDist - totaldist) / MaxDist;
    scores.push(f < 0 ? 0.0 : f);
  }
  return scores;
}
