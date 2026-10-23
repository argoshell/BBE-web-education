// Measures of periodic activity in a recorded time series: period, amplitude, phase lags,
// total variation, and a magnitude spectrum.

export interface CycleStats {
  /** Peak-to-peak amplitude (max - min) after the transient. */
  amplitude: number;
  min: number;
  max: number;
  /** Times of upward crossings of the midpoint (linearly interpolated). */
  crossings: number[];
  /** Mean period from the last crossings, or NaN if not oscillating. */
  period: number;
}

/** Amplitude below which a signal is treated as not oscillating. */
export const MIN_AMPLITUDE = 0.01;

export function cycleStats(t: ArrayLike<number>, x: ArrayLike<number>, from = 0): CycleStats {
  let min = Infinity, max = -Infinity;
  for (let i = from; i < x.length; i++) { if (x[i] < min) min = x[i]; if (x[i] > max) max = x[i]; }
  const amplitude = Number.isFinite(max - min) ? max - min : 0;
  const crossings: number[] = [];
  if (amplitude >= MIN_AMPLITUDE) {
    const mid = (min + max) / 2;
    for (let i = Math.max(from, 1); i < x.length; i++)
      if (x[i - 1] < mid && x[i] >= mid) crossings.push(t[i - 1] + ((mid - x[i - 1]) / (x[i] - x[i - 1])) * (t[i] - t[i - 1]));
  }
  let period = NaN;
  if (crossings.length >= 3) {
    // Average over the last (up to) 5 cycles
    const k = Math.min(5, crossings.length - 1);
    period = (crossings[crossings.length - 1] - crossings[crossings.length - 1 - k]) / k;
  }
  return { amplitude, min, max, crossings, period };
}

/** Phase of b relative to a, in cycles [0, 1), using their last upward crossings. */
export function phaseLag(a: CycleStats, b: CycleStats): number {
  if (!Number.isFinite(a.period) || a.crossings.length === 0 || b.crossings.length === 0) return NaN;
  const ta = a.crossings[a.crossings.length - 1], tb = b.crossings[b.crossings.length - 1];
  const lag = ((tb - ta) / a.period) % 1;
  return lag < 0 ? lag + 1 : lag;
}

/** Average absolute change per unit time after the transient (Beer's oscillation measure). */
export function totalVariation(t: ArrayLike<number>, x: ArrayLike<number>, from = 0): number {
  let s = 0;
  for (let i = Math.max(from, 1); i < x.length; i++) s += Math.abs(x[i] - x[i - 1]);
  const span = t[t.length - 1] - t[Math.max(from, 0)];
  return span > 0 ? s / span : 0;
}

/** In-place radix-2 FFT (re, im have power-of-two length). */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export interface Spectrum {
  freq: Float64Array;
  mag: Float64Array;
  peakFreq: number;
}

/** Magnitude spectrum of x (from index `from`), mean removed, Hann-windowed. dt = sample spacing. */
export function spectrum(x: ArrayLike<number>, dt: number, from = 0, maxPoints = 8192): Spectrum {
  const len = x.length - from;
  // Decimate long series to keep the FFT small
  const stride = Math.max(1, Math.ceil(len / maxPoints));
  const m = Math.floor(len / stride);
  let n = 1;
  while (n < m) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < m; i++) mean += x[from + i * stride] / m;
  for (let i = 0; i < m; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, m - 1));
    re[i] = (x[from + i * stride] - mean) * w;
  }
  fft(re, im);
  const half = n / 2, sdt = dt * stride;
  const freq = new Float64Array(half), mag = new Float64Array(half);
  let peak = 1;
  for (let k = 0; k < half; k++) {
    freq[k] = k / (n * sdt);
    mag[k] = (2 * Math.hypot(re[k], im[k])) / m;
    if (k > 0 && mag[k] > mag[peak]) peak = k;
  }
  return { freq, mag, peakFreq: half > 1 ? freq[peak] : NaN };
}
