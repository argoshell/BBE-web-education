// Animated side view of the one-legged walker at the current time index.
// Model coordinates have y increasing downward (the foot hangs below the joint).

import type { Recording } from '../../../sim/core/recording';
import type { LegBodyParams } from '../../../sim/agents/legged/body';
import { useCanvas } from '../../hooks/useCanvas';
import { fmt } from '../../plot';
import { useTheme, withAlpha } from '../../theme';

interface Props {
  rec: Recording;
  idx: number;
  body: LegBodyParams;
  height?: number;
}

/** Vertical extent shown, in model units (body top to just below the ground). */
const VIEW_H = 36;

export function WalkerBody({ rec, idx, body, height = 170 }: Props) {
  const theme = useTheme();
  const { boxRef, canvasRef } = useCanvas(height, (ctx, w, h) => {
    const ch = rec.channels;
    const i = Math.min(idx, rec.t.length - 1);
    const cx = ch.cx[i], jx = ch.jointX[i], jy = ch.jointY[i];
    const fx = ch.footX[i], fy = ch.footY[i], down = ch.footState[i] === 1;
    const s = (h - 30) / VIEW_H;
    const viewW = w / s;
    const groundY = jy + body.legLength;
    const sy0 = h - 26 - groundY * s; // screen y of model y = 0
    const X = (x: number) => w / 2 + (x - cx) * s;
    const Y = (y: number) => sy0 + y * s;

    ctx.fillStyle = theme.surface2;
    ctx.fillRect(0, 0, w, h);

    // Ground and scrolling ticks
    ctx.strokeStyle = theme.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(Y(groundY)) + 0.5);
    ctx.lineTo(w, Math.round(Y(groundY)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const x0 = cx - viewW / 2, x1 = cx + viewW / 2;
    for (let gx = Math.ceil(x0 / 10) * 10; gx <= x1; gx += 10) {
      ctx.beginPath();
      ctx.moveTo(X(gx) + 0.5, Y(groundY));
      ctx.lineTo(X(gx) + 0.5, Y(groundY) + (gx % 50 === 0 ? 7 : 4));
      ctx.stroke();
      if (gx % 50 === 0 || viewW < 120) ctx.fillText(String(gx), X(gx), Y(groundY) + 9);
    }

    // Footprints: where the foot was planted so far
    ctx.fillStyle = withAlpha(theme.series[0], 0.45);
    for (let k = 1; k <= i; k++) {
      if (ch.footState[k] === 1 && ch.footState[k - 1] !== 1) {
        const px = X(ch.footX[k]);
        if (px > -5 && px < w + 5) ctx.fillRect(px - 3, Y(groundY) - 2, 6, 3);
      }
    }

    // Angle-limit wedge
    ctx.fillStyle = withAlpha(theme.muted, 0.12);
    ctx.beginPath();
    ctx.moveTo(X(jx), Y(jy));
    const L = body.legLength;
    for (let a = body.backwardAngleLimit; a <= body.forwardAngleLimit + 1e-9; a += (body.forwardAngleLimit - body.backwardAngleLimit) / 20)
      ctx.lineTo(X(jx + L * Math.sin(a)), Y(jy + L * Math.cos(a)));
    ctx.closePath();
    ctx.fill();

    // Body
    const bw = 26, bTop = jy - 11;
    ctx.fillStyle = theme.text2;
    ctx.beginPath();
    ctx.roundRect(X(cx - bw / 2), Y(bTop), bw * s, 9 * s, 4 * s);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(X(cx + bw / 2), Y(bTop + 3), 3 * s, 0, Math.PI * 2);
    ctx.fill();

    // Leg (lifted slightly in swing so stance/swing is visible)
    const lift = down ? 0 : 1.6;
    const footScreenY = Y(fy - lift);
    ctx.strokeStyle = theme.text;
    ctx.lineWidth = Math.max(2, 0.9 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X(jx), Y(jy));
    ctx.lineTo(X(fx), footScreenY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(jx), Y(jy), 3, 0, Math.PI * 2);
    ctx.fillStyle = theme.text;
    ctx.fill();
    // Foot: filled = down (stance), ring = up (swing)
    ctx.beginPath();
    ctx.arc(X(fx), footScreenY, Math.max(4, 1.3 * s), 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    if (down) { ctx.fillStyle = theme.series[0]; ctx.fill(); }
    else { ctx.fillStyle = theme.surface2; ctx.fill(); ctx.strokeStyle = theme.series[1]; ctx.stroke(); }

    // Readout
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = theme.text2;
    ctx.fillText(`x = ${fmt(cx, 1)}   v = ${fmt(ch.vx[i], 3)}   angle = ${fmt((ch.angle[i] * 180) / Math.PI, 1)}°`, 8, 8);
    ctx.fillStyle = down ? theme.series[0] : theme.series[1];
    ctx.fillText(down ? '● stance (foot down)' : '○ swing (foot up)', 8, 26);
  }, [rec, idx, body, theme]);

  return (
    <div ref={boxRef} className="canvas-box" style={{ borderRadius: 6, overflow: 'hidden' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

/** Foot-down raster for comparing gaits: one row per recording. */
export function GaitRaster({ items, window: [i0, i1] }: { items: { rec: Recording; color: string; label: string }[]; window: [number, number] }) {
  const theme = useTheme();
  const rowH = 18, left = 90;
  const { boxRef, canvasRef } = useCanvas(items.length * (rowH + 4) + 4, (ctx, w) => {
    items.forEach((it, r) => {
      const top = r * (rowH + 4) + 2;
      const fs = it.rec.channels.footState;
      const end = Math.min(i1, fs.length - 1);
      const sx = (k: number) => left + ((k - i0) / Math.max(1, end - i0)) * (w - left - 4);
      ctx.fillStyle = theme.surface2;
      ctx.fillRect(left, top, w - left - 4, rowH);
      ctx.fillStyle = it.color;
      let k = i0;
      while (k <= end) {
        if (fs[k] === 1) {
          const s = k;
          while (k <= end && fs[k] === 1) k++;
          ctx.fillRect(sx(s), top + 2, Math.max(1, sx(k) - sx(s) - 1), rowH - 4);
        } else k++;
      }
      ctx.fillStyle = theme.text2;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(it.label, 2, top + rowH / 2);
    });
  }, [items, i0, i1, theme]);
  return <div ref={boxRef} className="canvas-box"><canvas ref={canvasRef} /></div>;
}
