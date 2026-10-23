import { describe, expect, it } from 'vitest';
import { cycleStats, phaseLag, spectrum, totalVariation } from '../src/sim/analysis/oscillation';

const dt = 0.01;
const t = Float64Array.from({ length: 5000 }, (_, i) => i * dt);
const sine = (period: number, phase = 0, amp = 0.4) => Float64Array.from(t, (s) => 0.5 + (amp / 2) * Math.sin((2 * Math.PI * s) / period - 2 * Math.PI * phase));

describe('oscillation analysis', () => {
  it('measures period, amplitude and phase', () => {
    const a = cycleStats(t, sine(7));
    expect(a.period).toBeCloseTo(7, 3);
    expect(a.amplitude).toBeCloseTo(0.4, 3);
    const b = cycleStats(t, sine(7, 0.25));
    expect(phaseLag(a, b)).toBeCloseTo(0.25, 2);
  });

  it('treats a flat signal as not oscillating', () => {
    const s = cycleStats(t, new Float64Array(t.length).fill(0.3));
    expect(s.amplitude).toBe(0);
    expect(Number.isNaN(s.period)).toBe(true);
    expect(totalVariation(t, new Float64Array(t.length).fill(0.3))).toBe(0);
  });

  it('total variation of a sine is 2 * amplitude per period', () => {
    expect(totalVariation(t, sine(5))).toBeCloseTo((2 * 0.4) / 5, 2);
  });

  it('finds the spectral peak', () => {
    const s = spectrum(sine(4), dt);
    expect(Math.abs(s.peakFreq - 0.25)).toBeLessThan(0.03);
  });
});
