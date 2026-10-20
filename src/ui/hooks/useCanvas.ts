// A DPR-aware canvas that tracks its container's width.

import { useEffect, useRef, useState } from 'react';

export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.floor(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Calls draw(ctx, w, h) whenever deps change. The canvas is sized to the container width
 * and the given height (or a height computed from width).
 */
export function useCanvas(
  height: number | ((w: number) => number),
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: unknown[],
) {
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const h = typeof height === 'function' ? height(width) : height;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(width * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(width * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${width}px`;
      c.style.height = `${h}px`;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, h);
    draw(ctx, width, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, h, ...deps]);
  return { boxRef, canvasRef, width, height: h };
}
