import type { SubjectId } from '../classroom/subject';
import type { Painter } from './halftone';
import { paintDocument } from './painters';

/**
 * One picture per subject for the dot-matrix covers. Each is drawn in white on black, because the dots follow brightness:
 * the brighter a part is, the bigger its dots. Small variations come from a seed, so a course always looks the same
 * but two courses in one subject are not identical.
 */
type Ctx = CanvasRenderingContext2D;
const W = (a: number) => `rgba(255,255,255,${a})`;

function ring(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, a: number, lw: number) {
  ctx.strokeStyle = W(a);
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.stroke();
}
function disc(ctx: Ctx, x: number, y: number, r: number, a: number) {
  ctx.fillStyle = W(a);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, a: number, lw: number) {
  ctx.strokeStyle = W(a);
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function hex(ctx: Ctx, cx: number, cy: number, r: number, a: number, lw: number, fill = 0) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const t = (Math.PI / 3) * i + Math.PI / 6;
    const px = cx + r * Math.cos(t);
    const py = cy + r * Math.sin(t);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = W(fill);
    ctx.fill();
  }
  ctx.strokeStyle = W(a);
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** A small seeded random generator (mulberry32), so the same course always gets the same picture. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Draw = (ctx: Ctx, w: number, h: number, rnd: () => number) => void;

const DRAW: Partial<Record<SubjectId, Draw>> = {
  physics(ctx, w, h, rnd) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const turn = rnd() * 0.6;
    for (let k = 0; k < 3; k++) ring(ctx, cx, cy, w * 0.36, h * 0.17, turn + (k * Math.PI) / 3, 0.9, 6);
    disc(ctx, cx, cy, h * 0.12, 1);
    for (let k = 0; k < 3; k++) {
      const a = turn + (k * Math.PI) / 3;
      const t = rnd() * 6.28;
      const ex = w * 0.36 * Math.cos(t);
      const ey = h * 0.17 * Math.sin(t);
      disc(
        ctx,
        cx + ex * Math.cos(a) - ey * Math.sin(a),
        cy + ex * Math.sin(a) + ey * Math.cos(a),
        h * 0.06,
        1,
      );
    }
  },
  chemistry(ctx, w, h, rnd) {
    const r = h * 0.19;
    const dx = r * Math.sqrt(3);
    const ox = w * 0.5 - dx;
    const oy = h * 0.5;
    const o = rnd() > 0.5 ? 1 : 0;
    for (let i = 0; i < 3; i++)
      hex(ctx, ox + i * dx, oy + (i % 2 ? r * 0.5 : -r * 0.5) * (o ? 1 : -1), r, 0.95, 7, i === 1 ? 0.5 : 0);
    hex(ctx, ox + dx * 0.5, oy + (o ? -r * 1.25 : r * 1.25), r * 0.001, 0, 0);
    [
      [ox - dx * 0.2, oy - r * 1.9],
      [ox + dx * 2.3, oy + r * 1.8],
    ].forEach(([x, y]) => disc(ctx, x, y, h * 0.08, 1));
    for (let i = 0; i < 4; i++) disc(ctx, w * (0.1 + rnd() * 0.8), h * (0.1 + rnd() * 0.8), h * 0.025, 0.6);
  },
  biology(ctx, w, h, rnd) {
    // a double helix with its rungs
    const phase = rnd() * 6;
    const amp = h * 0.3;
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const x = w * (0.12 + (i / n) * 0.76);
      const a = Math.sin(i * 0.5 + phase) * amp;
      const front = Math.cos(i * 0.5 + phase);
      if (i % 2 === 0) line(ctx, x, h * 0.5 - a, x, h * 0.5 + a, 0.55, 2.4);
      disc(ctx, x, h * 0.5 - a, h * (front > 0 ? 0.05 : 0.032), front > 0 ? 1 : 0.6);
      disc(ctx, x, h * 0.5 + a, h * (front > 0 ? 0.032 : 0.05), front > 0 ? 0.6 : 1);
    }
  },
  math(ctx, w, h, rnd) {
    const sh = rnd() * 3;
    for (let i = 1; i < 8; i++) line(ctx, (w * i) / 8, h * 0.08, (w * i) / 8, h * 0.92, 0.18, 1);
    for (let i = 1; i < 5; i++) line(ctx, w * 0.04, (h * i) / 5, w * 0.96, (h * i) / 5, 0.18, 1);
    line(ctx, w * 0.04, h * 0.5, w * 0.96, h * 0.5, 0.7, 2.5);
    line(ctx, w * 0.08, h * 0.06, w * 0.08, h * 0.94, 0.7, 2.5);
    ctx.strokeStyle = W(1);
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= w * 0.86; x += 3) {
      const y = h * 0.5 - Math.sin(x / (w * 0.07) + sh) * h * 0.32;
      if (x) ctx.lineTo(w * 0.08 + x, y);
      else ctx.moveTo(w * 0.08 + x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = W(0.5);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= w * 0.86; x += 3) {
      const u = (x - w * 0.43) / (w * 0.2);
      const y = h * 0.78 - u * u * h * 0.18;
      if (x) ctx.lineTo(w * 0.08 + x, y);
      else ctx.moveTo(w * 0.08 + x, y);
    }
    ctx.stroke();
  },
  cs(ctx, w, h, rnd) {
    // a binary tree, with braces either side
    const nodes: [number, number][] = [];
    const walk = (x: number, y: number, dx: number, d: number) => {
      nodes.push([x, y]);
      if (d >= 3) return;
      for (const s of [-1, 1]) {
        if (rnd() > 0.12) {
          line(ctx, x, y, x + s * dx, y + h * 0.22, 0.85, 6);
          walk(x + s * dx, y + h * 0.22, dx / 2, d + 1);
        }
      }
    };
    walk(w * 0.5, h * 0.18, w * 0.18, 0);
    nodes.forEach(([x, y], i) => disc(ctx, x, y, h * (i ? 0.07 : 0.09), 1));
    const brace = (x: number, dir: number) => {
      ctx.strokeStyle = W(0.7);
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + dir * w * 0.05, h * 0.08);
      ctx.quadraticCurveTo(x, h * 0.08, x, h * 0.28);
      ctx.lineTo(x, h * 0.4);
      ctx.quadraticCurveTo(x, h * 0.5, x - dir * w * 0.03, h * 0.5);
      ctx.quadraticCurveTo(x, h * 0.5, x, h * 0.6);
      ctx.lineTo(x, h * 0.72);
      ctx.quadraticCurveTo(x, h * 0.92, x + dir * w * 0.05, h * 0.92);
      ctx.stroke();
    };
    brace(w * 0.07, 1);
    brace(w * 0.93, -1);
  },
  history(ctx, w, h, rnd) {
    const cols = 5 + (rnd() > 0.5 ? 1 : 0);
    const left = w * 0.18;
    const span = w * 0.64;
    ctx.fillStyle = W(0.85);
    ctx.beginPath();
    ctx.moveTo(left - w * 0.04, h * 0.3);
    ctx.lineTo(w * 0.5, h * 0.08);
    ctx.lineTo(left + span + w * 0.04, h * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(left - w * 0.04, h * 0.32, span + w * 0.08, h * 0.05);
    for (let i = 0; i < cols; i++) {
      const x = left + (span * i) / (cols - 1) - w * 0.018;
      ctx.fillStyle = W(0.95);
      ctx.fillRect(x, h * 0.4, w * 0.036, h * 0.42);
      ctx.fillStyle = W(0.55);
      ctx.fillRect(x + w * 0.028, h * 0.4, w * 0.008, h * 0.42);
    }
    ctx.fillStyle = W(0.85);
    ctx.fillRect(left - w * 0.06, h * 0.83, span + w * 0.12, h * 0.06);
    ctx.fillRect(left - w * 0.08, h * 0.9, span + w * 0.16, h * 0.05);
  },
  language(ctx, w, h, rnd) {
    ctx.fillStyle = W(1);
    ctx.font = `700 ${Math.round(h * 1.5)}px Georgia, serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('“', w * 0.06, h * 0.96);
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const lw = w * (0.3 - (i === rows - 1 ? 0.12 : 0) + rnd() * 0.08);
      ctx.fillStyle = W(0.85 - i * 0.1);
      ctx.fillRect(w * 0.5, h * (0.2 + i * 0.17), lw, h * 0.07);
    }
    ctx.fillStyle = W(0.95);
    ctx.font = `800 ${Math.round(h * 0.34)}px system-ui, sans-serif`;
    ctx.fillText('Aa', w * 0.5, h * 0.96);
  },
  business(ctx, w, h, rnd) {
    const n = 6;
    const pts: [number, number][] = [];
    let prev = 0.25;
    for (let i = 0; i < n; i++) {
      prev = Math.min(0.9, prev + 0.06 + rnd() * 0.14);
      const bw = w * 0.085;
      const x = w * 0.1 + i * w * 0.145;
      const bh = h * prev;
      ctx.fillStyle = W(0.55 + i * 0.07);
      ctx.fillRect(x, h * 0.92 - bh, bw, bh);
      pts.push([x + bw / 2, h * 0.92 - bh - h * 0.08]);
    }
    ctx.strokeStyle = W(1);
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    const [lx, ly] = pts[pts.length - 1];
    disc(ctx, lx, ly, h * 0.05, 1);
    line(ctx, w * 0.06, h * 0.93, w * 0.96, h * 0.93, 0.7, 2.5);
  },
  arts(ctx, w, h, rnd) {
    const r = h * 0.34;
    const j = (rnd() - 0.5) * w * 0.05;
    disc(ctx, w * 0.36 + j, h * 0.44, r, 0.7);
    disc(ctx, w * 0.56, h * 0.36, r * 0.95, 0.5);
    disc(ctx, w * 0.5, h * 0.64, r * 0.9, 0.85);
    ctx.strokeStyle = W(1);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.85);
    ctx.bezierCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 1.05, w * 0.94, h * 0.45);
    ctx.stroke();
  },
  health(ctx, w, h, rnd) {
    // a heart over a pulse line
    const cx = w * 0.5;
    const cy = h * 0.36;
    const s = h * 0.34;
    ctx.fillStyle = W(0.95);
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.7, cy - s * 1.25, cx, cy - s * 0.35);
    ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.25, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.9);
    ctx.fill();
    const beat = 0.5 + rnd() * 0.15;
    ctx.strokeStyle = W(1);
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.03, h * 0.78);
    ctx.lineTo(w * 0.34, h * 0.78);
    ctx.lineTo(w * 0.4, h * 0.62);
    ctx.lineTo(w * 0.46, h * 0.95);
    ctx.lineTo(w * 0.53, h * (0.78 - beat * 0.35));
    ctx.lineTo(w * 0.58, h * 0.78);
    ctx.lineTo(w * 0.97, h * 0.78);
    ctx.stroke();
  },
};

/** The picture for a subject. A course with no clear subject keeps the page-and-topic-map picture. */
export function subjectPainter(id: SubjectId, seed: string): Painter {
  const draw = DRAW[id];
  if (!draw) return paintDocument;
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (ctx, w, hh) => {
    ctx.clearRect(0, 0, w, hh);
    draw(ctx, w, hh, rng(h || 1));
  };
}
