// Principal components of a set of vectors (power iteration with deflation).
// Intended for small dimensions (genomes of tens of genes).

export interface PCA {
  mean: Float64Array;
  components: Float64Array[];
  /** Fraction of total variance explained by each component. */
  explained: number[];
  project(v: ArrayLike<number>): number[];
}

export function pca(data: ArrayLike<number>[], k = 2): PCA {
  const n = data.length, d = n ? data[0].length : 0;
  const mean = new Float64Array(d);
  for (const v of data) for (let i = 0; i < d; i++) mean[i] += v[i] / n;
  const C = new Float64Array(d * d);
  for (const v of data)
    for (let i = 0; i < d; i++) {
      const a = v[i] - mean[i];
      for (let j = i; j < d; j++) C[i * d + j] += (a * (v[j] - mean[j])) / Math.max(1, n - 1);
    }
  for (let i = 0; i < d; i++) for (let j = 0; j < i; j++) C[i * d + j] = C[j * d + i];
  let total = 0;
  for (let i = 0; i < d; i++) total += C[i * d + i];

  const components: Float64Array[] = [], explained: number[] = [];
  for (let c = 0; c < Math.min(k, d); c++) {
    let v = Float64Array.from({ length: d }, (_, i) => Math.sin(i + 1 + c));
    let lambda = 0;
    for (let it = 0; it < 200; it++) {
      const w = new Float64Array(d);
      for (let i = 0; i < d; i++) { let s = 0; for (let j = 0; j < d; j++) s += C[i * d + j] * v[j]; w[i] = s; }
      const norm = Math.hypot(...w);
      if (norm === 0) break;
      for (let i = 0; i < d; i++) w[i] /= norm;
      const diff = w.reduce((s, x, i) => s + Math.abs(x - v[i]), 0);
      v = w;
      lambda = norm;
      if (diff < 1e-10) break;
    }
    components.push(v);
    explained.push(total > 0 ? lambda / total : 0);
    // Deflate
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i * d + j] -= lambda * v[i] * v[j];
  }
  return {
    mean,
    components,
    explained,
    project: (x) => components.map((pc) => { let s = 0; for (let i = 0; i < d; i++) s += (x[i] - mean[i]) * pc[i]; return s; }),
  };
}
