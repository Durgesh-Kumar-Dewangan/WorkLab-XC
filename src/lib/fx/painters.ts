import { clamp, seeded } from '../util';
import { FONT_SANS } from '../fonts';
import type { Painter } from './halftone';

type Ctx = CanvasRenderingContext2D;

function person(
  ctx: Ctx,
  x: number,
  y: number,
  s: number,
  lum: number,
  arm: { dx: number; dy: number } | null,
) {
  const g = ctx.createLinearGradient(0, y - s, 0, y + s);
  g.addColorStop(0, `rgba(255,255,255,${lum})`);
  g.addColorStop(1, `rgba(255,255,255,${lum * 0.45})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.95, s * 0.27, 0, 6.3);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y + s * 0.1);
  ctx.quadraticCurveTo(x - s * 0.55, y - s * 0.55, x, y - s * 0.6);
  ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.55, x + s * 0.5, y + s * 0.1);
  ctx.closePath();
  ctx.fill();
  if (arm) {
    ctx.lineWidth = s * 0.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.4, y - s * 0.35);
    ctx.lineTo(x + s * 0.55 + arm.dx, y - s * 1.3 + arm.dy);
    ctx.stroke();
  }
}

export const paintClassroom: Painter = (ctx, w, h, t) => {
  const floor = ctx.createLinearGradient(0, h * 0.55, 0, h);
  floor.addColorStop(0, 'rgba(255,255,255,.04)');
  floor.addColorStop(1, 'rgba(255,255,255,.22)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);
  const bd = ctx.createLinearGradient(0, 0, 0, h * 0.5);
  bd.addColorStop(0, 'rgba(255,255,255,.34)');
  bd.addColorStop(1, 'rgba(255,255,255,.16)');
  ctx.fillStyle = bd;
  ctx.fillRect(w * 0.26, h * 0.08, w * 0.48, h * 0.3);
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  for (let i = 0; i < 5; i++)
    ctx.fillRect(w * 0.3, h * (0.14 + i * 0.045), w * (0.2 + (i % 3) * 0.08), h * 0.012);
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(w * 0.26, h * 0.08, w * 0.48, h * 0.3);
  person(ctx, w * 0.56, h * 0.66, h * 0.34, 0.95, null);
  const rng = seeded(7);
  [h * 0.78, h * 0.94].forEach((ry, ri) => {
    const n = ri === 0 ? 6 : 5;
    const sc = ri === 0 ? h * 0.2 : h * 0.26;
    for (let i = 0; i < n; i++) {
      const x = w * (0.12 + (i + 0.5) * (0.76 / n)) + (ri ? w * 0.05 : 0);
      const lum = 0.55 + rng() * 0.4;
      const hand = ri === 0 && i === 4 ? { dx: Math.sin(t * 3) * 4, dy: Math.cos(t * 2.4) * 3 } : null;
      person(ctx, x, ry, sc, lum, hand);
    }
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.fillRect(w * 0.08, ry + sc * 0.02, w * 0.84, sc * 0.12);
  });
};

export const paintDocument: Painter = (ctx, w, h, t0) => {
  const t = t0 || 0;
  const cyc = (t * 0.3) % 1.6;
  const sweep = h * (0.06 + Math.min(cyc, 1) * 0.9);
  const rowY = (i: number) => h * (0.1 + i * 0.058);
  const N = 15;
  const heads = [0, 5, 10];
  const tops = [1, 2, 6, 7, 11, 12];
  const page = { x: w * 0.03, y: h * 0.04, w: w * 0.42, h: h * 0.92 };
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  ctx.fillRect(page.x, page.y, page.w, page.h);
  ctx.strokeStyle = 'rgba(255,255,255,.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(page.x, page.y, page.w, page.h);
  const rng = seeded(11);
  for (let i = 0; i < N; i++) {
    const y = rowY(i);
    const head = heads.includes(i);
    const top = tops.includes(i);
    const read = y < sweep;
    const ww = page.w * (head ? 0.68 : top ? 0.55 : 0.5 + rng() * 0.32);
    const hh = head ? h * 0.042 : top ? h * 0.03 : h * 0.022;
    ctx.fillStyle = `rgba(255,255,255,${read ? (head ? 1 : top ? 0.9 : 0.55) : 0.4})`;
    ctx.fillRect(page.x + page.w * 0.1 + (top ? page.w * 0.08 : 0), y, ww, hh);
  }
  if (cyc < 1) {
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(page.x - 4, sweep - 1, page.w + 8, 3);
  }
  const reveal = (y: number) => clamp((sweep - y) / (h * 0.05), 0, 1);
  const ux = w * 0.6,
    tx = w * 0.8,
    uw = w * 0.17,
    uh = h * 0.075,
    tw = w * 0.16,
    th = h * 0.05;
  ctx.lineWidth = 2;
  heads.forEach((hi) => {
    const y = rowY(hi);
    const a = reveal(y);
    if (a <= 0) return;
    const cy = y + h * 0.015;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(page.x + page.w + 2, cy);
    ctx.lineTo(ux, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,255,255,${0.95 * a})`;
    ctx.fillRect(ux, cy - uh / 2, uw, uh);
    const kids = tops.filter((ti) => ti > hi && ti < hi + 5);
    if (kids.length) {
      const ky = kids.map((ti) => rowY(ti) + h * 0.01);
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * a})`;
      ctx.beginPath();
      ctx.moveTo(ux + uw, cy);
      ctx.lineTo(w * 0.74, cy);
      ctx.lineTo(w * 0.74, ky[ky.length - 1]);
      ctx.stroke();
      kids.forEach((ti, j) => {
        const kyy = ky[j];
        const ka = reveal(rowY(ti));
        if (ka <= 0) return;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * ka})`;
        ctx.beginPath();
        ctx.moveTo(w * 0.74, kyy);
        ctx.lineTo(tx, kyy);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${0.7 * ka})`;
        ctx.fillRect(tx, kyy - th / 2, tw, th);
      });
    }
  });
};

const GRAPH_NODES = (() => {
  const r = seeded(21);
  const a: { x: number; y: number; r: number }[] = [{ x: 0.5, y: 0.5, r: 14 }];
  for (let i = 0; i < 6; i++) {
    const an = (i / 6) * 6.283 + 0.4;
    a.push({ x: 0.5 + Math.cos(an) * 0.2, y: 0.5 + Math.sin(an) * 0.3, r: 9 });
  }
  for (let i = 0; i < 14; i++) {
    const an = (i / 14) * 6.283;
    a.push({
      x: 0.5 + Math.cos(an) * (0.38 + r() * 0.06),
      y: 0.5 + Math.sin(an) * (0.4 + r() * 0.05),
      r: 5 + r() * 3,
    });
  }
  return a;
})();

export const paintGraph: Painter = (ctx, w, h, t) => {
  const N = GRAPH_NODES;
  const pt = (n: { x: number; y: number }, i: number) => ({
    x: n.x * w + Math.sin((t || 0) * 0.7 + i) * 3,
    y: n.y * h + Math.cos((t || 0) * 0.6 + i * 1.3) * 3,
  });
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 1.4;
  N.forEach((n, i) => {
    if (i === 0) return;
    const p = pt(n, i);
    const q = i <= 6 ? pt(N[0], 0) : pt(N[1 + (i % 6)], 1 + (i % 6));
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  });
  N.forEach((n, i) => {
    const p = pt(n, i);
    ctx.fillStyle = i === 0 ? '#fff' : `rgba(255,255,255,${0.55 + (i % 4) * 0.12})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, n.r, 0, 6.3);
    ctx.fill();
  });
};

export const paintBars: Painter = (ctx, w, h, t) => {
  const rng = seeded(5);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const bh = h * (0.18 + rng() * 0.62) * (0.85 + Math.sin((t || 0) + i) * 0.05);
    ctx.fillStyle = `rgba(255,255,255,${0.4 + (i / n) * 0.55})`;
    ctx.fillRect(w * (0.08 + i * 0.062), h * 0.92 - bh, w * 0.04, bh);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.06, h * 0.93);
  ctx.lineTo(w * 0.94, h * 0.93);
  ctx.stroke();
};

export const paintWordmark =
  (text: string): Painter =>
  (ctx, w, h) => {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let size = h * 1.05;
    ctx.font = `800 ${size}px ${FONT_SANS}`;
    const mw = ctx.measureText(text).width;
    if (mw > w * 0.94) {
      size *= (w * 0.94) / mw;
      ctx.font = `800 ${size}px ${FONT_SANS}`;
    }
    ctx.fillText(text, w / 2, h * 0.86);
  };
