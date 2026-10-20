// Port of Beer's RandomState (random.cpp): Numerical Recipes ran1 plus Knuth's polar
// method for Gaussians. All integer arithmetic stays below 2^53, so this is bit-exact
// with the C++ (32-bit long) implementation.

const IA = 16807;
const IM = 2147483647;
const AM = 1.0 / IM;
const IQ = 127773;
const IR = 2836;
const NTAB = 32;
const NDIV = 1 + Math.trunc((IM - 1) / NTAB);
const EPS = 1.2e-7;
const RNMX = 1.0 - EPS;

/** LONG_MAX as seen by the reference build (wasm32 / Windows). */
export const LONG_MAX = 2147483647;

/** Convert to a C int the way wasm's saturating truncation does. */
function toInt32(x: number): number {
  if (x >= 2147483647) return 2147483647;
  if (x <= -2147483648) return -2147483648;
  return Math.trunc(x);
}

export interface RandomStateSnapshot {
  seed: number;
  idum: number;
  iy: number;
  iv: number[];
  gaussianFlag: number;
  gX1: number;
  gX2: number;
}

export class RandomState {
  seed = 0;
  idum = 0;
  iy = 0;
  iv = new Array<number>(NTAB).fill(0);
  gaussianFlag = 0;
  gX1 = 0;
  gX2 = 0;

  constructor(seed = 0) {
    this.setRandomSeed(seed);
    this.gaussianFlag = 0;
  }

  setRandomSeed(s: number): void {
    this.idum = this.seed = s;
    if (this.idum === 0) this.idum = 1;
    for (let j = NTAB + 7; j >= 0; j--) {
      const k = Math.trunc(this.idum / IQ);
      this.idum = IA * (this.idum - k * IQ) - IR * k;
      if (this.idum < 0) this.idum += IM;
      if (j < NTAB) this.iv[j] = this.idum;
    }
    this.iy = this.iv[0];
  }

  getRandomSeed(): number {
    return this.seed;
  }

  /** Uniform deviate in (0, 1). */
  ran1(): number {
    if (!this.iy) this.setRandomSeed(1);
    const k = Math.trunc(this.idum / IQ);
    this.idum = IA * (this.idum - k * IQ) - IR * k;
    if (this.idum < 0) this.idum += IM;
    const j = Math.trunc(this.iy / NDIV);
    this.iy = this.iv[j];
    this.iv[j] = this.idum;
    const temp = AM * this.iy;
    return temp > RNMX ? RNMX : temp;
  }

  uniformRandom(min: number, max: number): number {
    return (max - min) * this.ran1() + min;
  }

  /** Uniform integer in [min, max] inclusive. */
  uniformRandomInteger(min: number, max: number): number {
    return toInt32(Math.floor(0.5 + this.uniformRandom(min - 0.5, max + 0.5)));
  }

  private generateNormals(): void {
    let v1: number, v2: number, s: number;
    do {
      v1 = this.uniformRandom(-1.0, 1.0);
      v2 = this.uniformRandom(-1.0, 1.0);
      s = v1 * v1 + v2 * v2;
    } while (s >= 1.0 || s === 0.0);
    const d = Math.sqrt((-2 * Math.log(s)) / s);
    this.gX1 = v1 * d;
    this.gX2 = v2 * d;
  }

  gaussianRandom(mean: number, variance: number): number {
    if (!this.gaussianFlag) {
      this.generateNormals();
      this.gaussianFlag = 1;
      return Math.sqrt(variance) * this.gX1 + mean;
    }
    this.gaussianFlag = 0;
    return Math.sqrt(variance) * this.gX2 + mean;
  }

  /** Fill v with a random unit vector. */
  randomUnitVector(v: Float64Array | number[]): void {
    let r = 0.0;
    for (let i = 0; i < v.length; i++) {
      v[i] = this.gaussianRandom(0, 1);
      r += v[i] * v[i];
    }
    r = Math.sqrt(r);
    for (let i = 0; i < v.length; i++) v[i] = v[i] / r;
  }

  /** Return 1 with probability prob, else 0. */
  probabilisticChoice(prob: number): number {
    return this.uniformRandom(0.0, 1.0) <= prob ? 1 : 0;
  }

  snapshot(): RandomStateSnapshot {
    return {
      seed: this.seed,
      idum: this.idum,
      iy: this.iy,
      iv: this.iv.slice(),
      gaussianFlag: this.gaussianFlag,
      gX1: this.gX1,
      gX2: this.gX2,
    };
  }

  static fromSnapshot(s: RandomStateSnapshot): RandomState {
    const rs = new RandomState(1);
    rs.restore(s);
    return rs;
  }

  restore(s: RandomStateSnapshot): void {
    this.seed = s.seed;
    this.idum = s.idum;
    this.iy = s.iy;
    this.iv = s.iv.slice();
    this.gaussianFlag = s.gaussianFlag;
    this.gX1 = s.gX1;
    this.gX2 = s.gX2;
  }
}
