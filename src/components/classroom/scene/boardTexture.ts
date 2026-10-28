import { clamp } from '@/lib/util';
import type { BoardData } from '@/lib/classroom/controller';
import { SUBJECTS, type SubjectId, type SubjectLook } from '@/lib/classroom/subject';

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const lines: string[] = [];
  let line = '';
  text.split(' ').forEach((x) => {
    const t = line ? `${line} ${x}` : x;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = x;
    } else line = t;
  });
  if (line) lines.push(line);
  return lines;
}

/** A faint picture that says what the lesson is about, drawn once from shapes (no image data) and reused for every slide. */
const motifCache = new Map<string, HTMLCanvasElement>();

function motif(look: SubjectLook, W: number, H: number): HTMLCanvasElement {
  const key = `${look.id}:${W}x${H}`;
  const hit = motifCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const R = (a: number) =>
    Math.round(a * 255)
      .toString(16)
      .padStart(2, '0');
  const col = (hex: string, a: number) => `${hex}${R(a)}`;
  const A = look.accent;
  const B = look.accent2;
  const cx = W * 0.78;
  const cy = H * 0.5;
  switch (look.id) {
    case 'physics': {
      x.lineWidth = 3;
      for (let i = 1; i <= 4; i++) {
        x.strokeStyle = col(A, 0.16 - i * 0.02);
        x.beginPath();
        x.ellipse(cx, cy, 110 * i, 60 * i, -0.35, 0, 6.29);
        x.stroke();
        x.fillStyle = col(B, 0.35);
        x.beginPath();
        x.arc(cx + Math.cos(i * 1.7) * 110 * i, cy + Math.sin(i * 1.7) * 60 * i, 9, 0, 6.29);
        x.fill();
      }
      x.fillStyle = col(A, 0.35);
      x.beginPath();
      x.arc(cx, cy, 26, 0, 6.29);
      x.fill();
      x.strokeStyle = col(A, 0.14);
      x.lineWidth = 4;
      x.beginPath();
      for (let px = 0; px <= W; px += 8) x.lineTo(px, H - 120 + Math.sin(px / 60) * 26);
      x.stroke();
      break;
    }
    case 'chemistry': {
      x.lineWidth = 3;
      const r = 58;
      for (let row = 0; row < 7; row++)
        for (let k = 0; k < 6; k++) {
          const hx = W * 0.5 + k * r * 1.75 + (row % 2) * r * 0.87;
          const hy = 90 + row * r * 1.5;
          x.strokeStyle = col(A, 0.14);
          x.beginPath();
          for (let s = 0; s <= 6; s++)
            x.lineTo(
              hx + r * Math.cos((s * Math.PI) / 3 + Math.PI / 6),
              hy + r * Math.sin((s * Math.PI) / 3 + Math.PI / 6),
            );
          x.stroke();
          if ((row + k) % 3 === 0) {
            x.fillStyle = col(B, 0.28);
            x.beginPath();
            x.arc(hx, hy, 11, 0, 6.29);
            x.fill();
          }
        }
      break;
    }
    case 'biology': {
      x.lineWidth = 4;
      for (let s = 0; s < 2; s++) {
        x.strokeStyle = col(s ? B : A, 0.22);
        x.beginPath();
        for (let py = 0; py <= H; py += 10) x.lineTo(cx + Math.sin(py / 70 + s * Math.PI) * 120, py);
        x.stroke();
      }
      x.lineWidth = 2;
      x.strokeStyle = col(A, 0.14);
      for (let py = 20; py < H; py += 36) {
        const o = Math.sin(py / 70) * 120;
        x.beginPath();
        x.moveTo(cx + o, py);
        x.lineTo(cx - o, py);
        x.stroke();
      }
      break;
    }
    case 'math': {
      x.lineWidth = 1.5;
      x.strokeStyle = col(A, 0.08);
      for (let gx = 0; gx <= W; gx += 80) {
        x.beginPath();
        x.moveTo(gx, 0);
        x.lineTo(gx, H);
        x.stroke();
      }
      for (let gy = 0; gy <= H; gy += 80) {
        x.beginPath();
        x.moveTo(0, gy);
        x.lineTo(W, gy);
        x.stroke();
      }
      x.lineWidth = 4;
      x.strokeStyle = col(B, 0.3);
      x.beginPath();
      for (let px = W * 0.5; px <= W; px += 6) x.lineTo(px, cy + Math.sin((px - W * 0.5) / 70) * 120);
      x.stroke();
      x.strokeStyle = col(A, 0.28);
      x.beginPath();
      for (let px = W * 0.55; px <= W; px += 6)
        x.lineTo(px, H - 80 - ((px - W * 0.78) * (px - W * 0.78)) / 520);
      x.stroke();
      x.fillStyle = col(A, 0.1);
      x.font = '700 170px serif';
      x.fillText('∑', W * 0.84, H * 0.3);
      x.fillText('π', W * 0.6, H * 0.88);
      break;
    }
    case 'cs': {
      for (let i = 0; i < 14; i++) {
        x.fillStyle = col(i % 3 ? A : B, 0.12);
        const w = 140 + ((i * 97) % 340);
        x.fillRect(W * 0.55 + (i % 4) * 26, 80 + i * 56, w, 16);
      }
      x.strokeStyle = col(A, 0.18);
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(W * 0.5, H - 90);
      x.lineTo(W * 0.62, H - 90);
      x.lineTo(W * 0.66, H - 140);
      x.lineTo(W - 60, H - 140);
      x.stroke();
      x.fillStyle = col(A, 0.2);
      x.beginPath();
      x.arc(W - 60, H - 140, 9, 0, 6.29);
      x.fill();
      x.font = '700 260px monospace';
      x.fillStyle = col(B, 0.07);
      x.fillText('{ }', W * 0.62, H * 0.82);
      break;
    }
    case 'history': {
      x.strokeStyle = col(A, 0.22);
      x.lineWidth = 4;
      x.beginPath();
      x.moveTo(60, H - 150);
      x.lineTo(W - 60, H - 150);
      x.stroke();
      for (let i = 0; i < 9; i++) {
        const tx = 120 + i * ((W - 240) / 8);
        x.beginPath();
        x.moveTo(tx, H - 166);
        x.lineTo(tx, H - 134);
        x.stroke();
        x.fillStyle = col(i % 2 ? B : A, 0.3);
        x.beginPath();
        x.arc(tx, H - 150, 9, 0, 6.29);
        x.fill();
      }
      x.fillStyle = col(A, 0.07);
      for (let k = 0; k < 5; k++) x.fillRect(W * 0.62 + k * 70, 120, 34, 480);
      x.fillRect(W * 0.62 - 20, 90, 380, 28);
      break;
    }
    case 'language': {
      x.strokeStyle = col(A, 0.1);
      x.lineWidth = 2;
      for (let ly = 160; ly < H; ly += 64) {
        x.beginPath();
        x.moveTo(60, ly);
        x.lineTo(W - 60, ly);
        x.stroke();
      }
      x.fillStyle = col(B, 0.12);
      x.font = '700 520px serif';
      x.fillText('“', W * 0.66, H * 0.72);
      break;
    }
    case 'business': {
      for (let i = 0; i < 7; i++) {
        const h = 120 + ((i * 83) % 260) + i * 22;
        x.fillStyle = col(i % 2 ? B : A, 0.16);
        x.fillRect(W * 0.55 + i * 80, H - 110 - h, 50, h);
      }
      x.strokeStyle = col(A, 0.3);
      x.lineWidth = 5;
      x.beginPath();
      for (let i = 0; i < 7; i++)
        x.lineTo(W * 0.55 + i * 80 + 25, H - 150 - (120 + ((i * 83) % 260) + i * 22));
      x.stroke();
      break;
    }
    case 'arts': {
      const dots: [number, number, number, string][] = [
        [0.78, 0.35, 190, A],
        [0.88, 0.62, 150, B],
        [0.66, 0.7, 120, A],
        [0.92, 0.18, 90, B],
      ];
      dots.forEach(([fx, fy, rr, cc]) => {
        x.fillStyle = col(cc, 0.16);
        x.beginPath();
        x.arc(W * fx, H * fy, rr, 0, 6.29);
        x.fill();
      });
      break;
    }
    case 'health': {
      x.strokeStyle = col(A, 0.26);
      x.lineWidth = 5;
      x.beginPath();
      x.moveTo(0, H - 130);
      for (let px = 0; px < W; px += 280) {
        x.lineTo(px + 90, H - 130);
        x.lineTo(px + 120, H - 210);
        x.lineTo(px + 150, H - 70);
        x.lineTo(px + 180, H - 130);
        x.lineTo(px + 280, H - 130);
      }
      x.stroke();
      x.fillStyle = col(B, 0.12);
      x.fillRect(cx - 18, cy - 90, 36, 180);
      x.fillRect(cx - 90, cy - 18, 180, 36);
      break;
    }
    default: {
      x.fillStyle = 'rgba(255,255,255,.07)';
      for (let y = 0; y < 9; y++)
        for (let k = 0; k < 16; k++) {
          const l = Math.max(0, (k / 16 - 0.55) * 1.6 + (1 - y / 9) * 0.2);
          x.beginPath();
          x.arc(W - 40 - k * 20, 40 + y * 20, 1 + l * 6, 0, 6.3);
          x.fill();
        }
    }
  }
  motifCache.set(key, c);
  return c;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** Paints the current slide onto the 1600×900 board canvas. The look follows the subject: its colours, a quiet picture behind the words, numbered points. */
export function drawBoard(ctx: CanvasRenderingContext2D, W: number, H: number, d: BoardData) {
  const look = SUBJECTS[(d.subject as SubjectId) in SUBJECTS ? (d.subject as SubjectId) : 'general'];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, look.bg[0]);
  g.addColorStop(1, look.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(motif(look, W, H), 0, 0);
  // a soft glow in the corner opposite the picture keeps the words calm
  const glow = ctx.createRadialGradient(0, 0, 40, 0, 0, W * 0.7);
  glow.addColorStop(0, 'rgba(0,0,0,.28)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const mono = '600 24px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace';
  const sans = '"DM Sans Variable", "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textBaseline = 'alphabetic';

  // top row: the subject chip and where we are in the lesson
  ctx.font = mono;
  const chip = `${look.glyph}  ${look.label.toUpperCase()}`;
  const cw = ctx.measureText(chip).width + 44;
  ctx.fillStyle = `${look.accent}2e`;
  rr(ctx, 70, 44, cw, 52, 26);
  ctx.fill();
  ctx.strokeStyle = `${look.accent}88`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = look.accent;
  ctx.fillText(chip, 92, 79);
  ctx.fillStyle = look.dim;
  ctx.font = '500 24px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace';
  const crumb = (d.crumb || '').toUpperCase();
  ctx.fillText(crumb.length > 46 ? crumb.slice(0, 45) + '…' : crumb, 70 + cw + 24, 79);
  if (d.n) {
    const label = `${d.idx + 1} / ${d.n}`;
    ctx.font = mono;
    const lw = ctx.measureText(label).width + 36;
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    rr(ctx, W - 70 - lw, 44, lw, 52, 26);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(label, W - 70 - 18, 79);
    ctx.textAlign = 'left';
  }

  // title, with an accent bar
  const textW = d.photo ? Math.round(W * 0.5) : W - 140;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 74px ${sans}`;
  let y = 196;
  const titleLines = wrapText(ctx, d.title || '', textW - 30).slice(0, 2);
  ctx.fillStyle = look.accent;
  rr(ctx, 70, y - 62, 10, titleLines.length * 86 - 14, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  titleLines.forEach((l) => {
    ctx.fillText(l, 100, y);
    y += 86;
  });
  y += 4;

  // the points, as numbered cards; the type shrinks until they all fit above the formula
  const bottom = d.formula && d.formulaAlpha > 0 ? H - 230 : H - 80;
  const cardW = (d.photo ? textW : W - 140) - 30;
  const pad = 20;
  let fs = 44;
  let rows: { lines: string[]; h: number }[] = [];
  for (; fs >= 28; fs -= 3) {
    ctx.font = `400 ${fs}px ${sans}`;
    const lh = Math.round(fs * 1.22);
    rows = d.bullets.map((b) => {
      const lines = wrapText(ctx, b, cardW - pad * 2 - 84);
      return { lines, h: lines.length * lh + pad * 2 };
    });
    const total = rows.reduce((a, r) => a + r.h + 16, 0);
    if (y + total <= bottom) break;
  }
  const lh = Math.round(fs * 1.22);
  d.bullets.forEach((b, i) => {
    const a = d.reveal[i] ?? 1;
    const row = rows[i];
    if (a <= 0 || !row) return;
    const off = (1 - a) * 22;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    rr(ctx, 100, y + off, cardW, row.h, 22);
    ctx.fill();
    ctx.strokeStyle = `${look.accent}44`;
    ctx.lineWidth = 2;
    ctx.stroke();
    const br = Math.min(26, row.h / 2 - 6);
    ctx.fillStyle = i % 2 ? look.accent2 : look.accent;
    ctx.beginPath();
    ctx.arc(100 + pad + 24, y + off + row.h / 2, br, 0, 6.29);
    ctx.fill();
    ctx.fillStyle = '#06101f';
    ctx.font = `700 ${Math.round(br * 1.05)}px ${sans}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), 100 + pad + 24, y + off + row.h / 2 + br * 0.36);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#eef3ff';
    ctx.font = `400 ${fs}px ${sans}`;
    row.lines.forEach((l, k) => ctx.fillText(l, 100 + pad + 66, y + off + pad + fs * 0.92 + k * lh));
    y += row.h + 16;
    ctx.globalAlpha = 1;
  });
  if (d.photo) drawPhoto(ctx, W, H, d.photo);

  if (d.formula && d.formulaAlpha > 0) {
    ctx.globalAlpha = d.formulaAlpha;
    ctx.font = '600 58px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace';
    const fw = Math.min(W - 140, ctx.measureText(d.formula).width + 150);
    const fy = H - 200;
    ctx.fillStyle = `${look.accent2}26`;
    rr(ctx, 70, fy, fw, 112, 24);
    ctx.fill();
    ctx.strokeStyle = look.accent2;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = look.accent2;
    ctx.font = '700 20px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace';
    ctx.fillText('FORMULA', 100, fy + 34);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 56px "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace';
    ctx.fillText(d.formula, 100, fy + 90);
    ctx.globalAlpha = 1;
  }

  // lesson progress, as one slim bar with a dot where we are
  const px = 70;
  const pw = W - 140;
  const p = clamp(d.progress || 0, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  rr(ctx, px, H - 44, pw, 8, 4);
  ctx.fill();
  ctx.fillStyle = look.accent;
  rr(ctx, px, H - 44, Math.max(8, pw * p), 8, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px + pw * p, H - 40, 11, 0, 6.29);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

/** The real-world photograph, on the right of the slide, with its credit under it. */
function drawPhoto(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: { img: HTMLImageElement; credit: string },
) {
  const x = Math.round(W * 0.58);
  const y = 150;
  const w = W - 70 - x;
  const h = H - 150 - 150;
  const { naturalWidth: iw, naturalHeight: ih } = p.img;
  if (!iw || !ih) return;
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 28);
  else ctx.rect(x, y, w, h);
  ctx.clip();
  const sc = Math.max(w / iw, h / ih);
  ctx.drawImage(p.img, x + (w - iw * sc) / 2, y + (h - ih * sc) / 2, iw * sc, ih * sc);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 28);
  else ctx.rect(x, y, w, h);
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,238,252,.75)';
  ctx.font = '400 24px system-ui, sans-serif';
  const credit = `Photo: ${p.credit}`;
  ctx.fillText(credit.length > 62 ? credit.slice(0, 61) + '…' : credit, x, y + h + 34);
}

export function woodCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#6b4a30';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8; i++) {
    const v = 90 + ((i * 37) % 40);
    x.fillStyle = `rgb(${v + 30},${v - 8},${v - 40})`;
    x.fillRect(0, i * 64, 512, 62);
    x.fillStyle = 'rgba(0,0,0,.18)';
    x.fillRect(0, i * 64 + 62, 512, 2);
    for (let k = 0; k < 30; k++) {
      x.fillStyle = 'rgba(0,0,0,.05)';
      x.fillRect((k * 97 + i * 53) % 512, i * 64 + ((k * 13) % 60), 40 + (k % 5) * 20, 1);
    }
  }
  return c;
}

/** Vertical wood panelling like the lecture hall's back wall: eight planks per tile with fine grain and dark seams. */
export function woodWallCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const x = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    const v = ((i * 53) % 29) - 14;
    x.fillStyle = `rgb(${186 + v},${124 + v},${60 + v})`;
    x.fillRect(i * 128, 0, 128, 512);
    for (let k = 0; k < 46; k++) {
      x.fillStyle = k % 3 ? 'rgba(90,45,10,.07)' : 'rgba(255,220,160,.06)';
      x.fillRect(i * 128 + ((k * 37 + i * 19) % 124), 0, 1 + (k % 2), 512);
    }
    x.fillStyle = 'rgba(40,20,5,.55)';
    x.fillRect(i * 128, 0, 2, 512);
  }
  return c;
}

const INK = '#1d2a4a';
const BLUE = '#2f56c9';

/** What a whiteboard shows: the narration in words, a formula, or the slide's question with its options. */
export type SideContent =
  | { kind: 'say'; head: string; text: string }
  | { kind: 'formula'; head: string; text: string }
  | { kind: 'question'; head: string; text: string; opts: string[] }
  | { kind: 'blank' };

/** A whiteboard face. Blank content leaves the board clean. */
export function drawSideBoard(ctx: CanvasRenderingContext2D, W: number, H: number, c: SideContent) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#e9ecf1');
  g.addColorStop(1, '#d9dde4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (c.kind === 'blank' || !c.text) return;
  const sans = '"DM Sans Variable", "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
  const mono = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = BLUE;
  ctx.font = `600 30px ${mono}`;
  ctx.fillText(c.head.toUpperCase(), 56, 74);
  ctx.fillStyle = INK;
  if (c.kind === 'formula') {
    ctx.font = `500 76px ${mono}`;
    let y = 230;
    c.text.split('   ').forEach((f) => {
      ctx.fillText(f, 56, y);
      y += 110;
    });
    return;
  }
  const area = H - 150;
  const opts = c.kind === 'question' ? c.opts.map((o, i) => `${String.fromCharCode(65 + i)}.  ${o}`) : [];
  // shrink the type until the text (and the options under a question) fit the board
  let size = c.kind === 'question' ? 46 : 52;
  let lines: string[] = [];
  let optLines: string[][] = [];
  for (; size >= 26; size -= 2) {
    ctx.font = `500 ${size}px ${sans}`;
    lines = wrapText(ctx, c.text, W - 112);
    optLines = opts.map((o) => wrapText(ctx, o, W - 150));
    const rows = lines.length + optLines.reduce((n, l) => n + l.length, 0);
    if ((rows + (opts.length ? 0.6 : 0) + opts.length * 0.25) * size * 1.3 <= area) break;
  }
  const lh = size * 1.3;
  let y = 150 + size;
  ctx.font = `500 ${size}px ${sans}`;
  lines.forEach((l) => {
    ctx.fillText(l, 56, y);
    y += lh;
  });
  y += lh * 0.6;
  ctx.fillStyle = BLUE;
  optLines.forEach((ol) => {
    ol.forEach((l, k) => {
      ctx.fillText(k ? `     ${l}` : l, 56, y);
      y += lh;
    });
    y += lh * 0.25;
  });
}
