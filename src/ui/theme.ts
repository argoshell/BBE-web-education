// Read design tokens from CSS so canvas drawing follows light/dark mode.

import { useEffect, useState } from 'react';

export interface Theme {
  surface: string;
  surface2: string;
  text: string;
  text2: string;
  muted: string;
  grid: string;
  axis: string;
  accent: string;
  stance: string;
  mutedMark: string;
  series: string[];
  divNeg: string;
  divMid: string;
  divPos: string;
}

export function readTheme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    surface: v('--surface-1'),
    surface2: v('--surface-2'),
    text: v('--text-primary'),
    text2: v('--text-secondary'),
    muted: v('--text-muted'),
    grid: v('--grid'),
    axis: v('--axis'),
    accent: v('--accent'),
    stance: v('--stance'),
    mutedMark: v('--muted-mark'),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--series-${i}`)),
    divNeg: v('--div-neg'),
    divMid: v('--div-mid'),
    divPos: v('--div-pos'),
  };
}

/** Theme that updates when the color scheme changes. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setTheme(readTheme());
    mq.addEventListener('change', update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { mq.removeEventListener('change', update); obs.disconnect(); };
  }, []);
  return theme;
}

/** Fixed color per neuron (1-based), following the categorical order. Beyond 8 neurons, muted. */
export function neuronColor(theme: Theme, i: number): string {
  return theme.series[i - 1] ?? theme.mutedMark;
}

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Diverging color for t in [-1, 1]: negative pole, neutral midpoint, positive pole. */
export function divergingColor(theme: Theme, t: number): string {
  const mid = hexToRgb(theme.divMid);
  const pole = hexToRgb(t < 0 ? theme.divNeg : theme.divPos);
  const a = Math.min(1, Math.abs(t));
  const c = mid.map((m, k) => Math.round(m + (pole[k] - m) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const [r, g, b] = hexToRgb(color);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}
