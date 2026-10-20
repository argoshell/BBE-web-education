// Playback controls shared by every agent page: play/pause, speed, scrubber, view window.

import { useEffect, useRef } from 'react';
import { fmt } from '../plot';

interface Props {
  t: Float64Array;
  idx: number;
  onSeek: (i: number) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
  speed: number;
  onSpeed: (s: number) => void;
  window: [number, number];
  onWindow: (w: [number, number]) => void;
}

export function Transport({ t, idx, onSeek, playing, onPlaying, speed, onSpeed, window: [i0, i1], onWindow }: Props) {
  const n = t.length;
  const idxRef = useRef(idx);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const dt = n > 1 ? t[1] - t[0] : 0.1;
    let acc = 0;
    const tick = (now: number) => {
      // speed = simulated time units per second
      acc += ((now - last) / 1000) * speed;
      last = now;
      const steps = Math.floor(acc / dt);
      if (steps > 0) {
        acc -= steps * dt;
        let next = idxRef.current + steps;
        if (next >= n) next = 0;
        onSeek(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, n, t, onSeek]);

  return (
    <div className="inline" style={{ gap: 10 }}>
      <button className="btn primary" onClick={() => onPlaying(!playing)} style={{ minWidth: 70 }}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => onSeek(Number(e.target.value))}
        style={{ flex: 1, minWidth: 120, accentColor: 'var(--accent)' }} aria-label="Time" />
      <span className="num small" style={{ minWidth: 70 }}>t = {fmt(t[idx] ?? 0, 1)}</span>
      <label className="chip">speed
        <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
          {[2, 5, 10, 20, 50, 100].map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
      </label>
      <label className="chip">view
        <input type="number" className="num" style={{ width: 64 }} value={fmt(t[i0] ?? 0, 1)} step={10}
          onChange={(e) => onWindow([clampIdx(t, Number(e.target.value), 0, i1 - 2), i1])} />
        –
        <input type="number" className="num" style={{ width: 64 }} value={fmt(t[Math.min(i1, n - 1)] ?? 0, 1)} step={10}
          onChange={(e) => onWindow([i0, clampIdx(t, Number(e.target.value), i0 + 2, n - 1)])} />
      </label>
      <button className="btn small" onClick={() => onWindow([0, n - 1])}>all</button>
    </div>
  );
}

function clampIdx(t: Float64Array, time: number, lo: number, hi: number): number {
  const dt = t.length > 1 ? t[1] - t[0] : 1;
  return Math.max(lo, Math.min(hi, Math.round((time - t[0]) / dt)));
}
