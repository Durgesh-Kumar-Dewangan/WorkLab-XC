import { cssVar, prefersReducedMotion } from '../util';

export interface DotOptions {
  pitch: number;
  /** Dots across the picture. When set, the dot size follows the width, so a phone gets fine dots and a wide screen bigger ones. */
  targetCols?: number;
  gamma: number;
  cut: number;
  scale: number;
  fadeX: number;
  fadeTop: number;
  fadeBottom: number;
  color?: string;
  alpha: number;
}

export type HalftoneCanvas = HTMLCanvasElement & { _dpr?: number };
export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

export interface HalftoneOptions extends Partial<DotOptions> {
  srcW?: number;
  srcH?: number;
  animate?: boolean;
  frameMs?: number;
}

let tmp: HTMLCanvasElement | null = null;
let tctx: CanvasRenderingContext2D | null = null;
function scratch() {
  if (!tmp) {
    tmp = document.createElement('canvas');
    tctx = tmp.getContext('2d', { willReadFrequently: true });
  }
  return { tmp, tctx: tctx! };
}

/** Reads luminance from a small source canvas and draws dots whose radius follows brightness. */
export function renderDots(
  canvas: HalftoneCanvas,
  src: CanvasImageSource,
  opts: Partial<DotOptions> = {},
): void {
  const o: DotOptions = {
    pitch: 6,
    gamma: 1.15,
    cut: 0.05,
    scale: 1,
    fadeX: 0.12,
    fadeTop: 0,
    fadeBottom: 0,
    alpha: 1,
    ...opts,
  };
  // read from the canvas itself, so one part of a page (a dark footer) can set its own dot colour
  const color =
    o.color || getComputedStyle(canvas).getPropertyValue('--dot').trim() || cssVar('--dot') || '#fff';
  const dpr = canvas._dpr || 1;
  const W = canvas.width;
  const H = canvas.height;
  if (!W || !H) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const pitchCss = o.targetCols ? Math.min(o.pitch, Math.max(2.6, W / dpr / o.targetCols)) : o.pitch;
  const pitch = pitchCss * dpr;
  const cols = Math.max(2, Math.floor(W / pitch));
  const rows = Math.max(2, Math.floor(H / pitch));
  const { tmp: t, tctx: c } = scratch();
  t.width = cols;
  t.height = rows;
  c.fillStyle = '#000';
  c.fillRect(0, 0, cols, rows);
  c.drawImage(src, 0, 0, cols, rows);
  const d = c.getImageData(0, 0, cols, rows).data;
  ctx.fillStyle = color;
  ctx.globalAlpha = o.alpha;
  ctx.beginPath();
  const ox = (W - cols * pitch) / 2;
  const oy = (H - rows * pitch) / 2;
  for (let y = 0; y < rows; y++) {
    const fy =
      (o.fadeTop ? Math.min(1, y / (rows * o.fadeTop)) : 1) *
      (o.fadeBottom ? Math.min(1, (rows - 1 - y) / (rows * o.fadeBottom)) : 1);
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      if (l < o.cut) continue;
      const fx = o.fadeX ? Math.min(1, x / (cols * o.fadeX), (cols - 1 - x) / (cols * o.fadeX)) : 1;
      const r = pitch * 0.5 * Math.pow(l, o.gamma) * o.scale * Math.min(fx, fy);
      if (r < 0.35 * dpr) continue;
      const cx = ox + x * pitch + pitch / 2;
      const cy = oy + y * pitch + pitch / 2;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, 6.2832);
    }
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

export interface HalftoneHandle {
  redraw(): void;
  stop(): void;
}

/** Attach a halftone to a canvas element. `paint` draws white-on-black luminance into a small source canvas. */
export function makeHalftone(
  canvas: HalftoneCanvas,
  paint: Painter,
  o: HalftoneOptions = {},
): HalftoneHandle {
  const sw = o.srcW || 480;
  const sh = o.srcH || 270;
  const src = document.createElement('canvas');
  src.width = sw;
  src.height = sh;
  const sctx = src.getContext('2d')!;
  let visible = true;
  let raf = 0;
  const t0 = performance.now();
  let stopped = false;
  let lastDraw = 0;
  const opts: HalftoneOptions = { ...o };

  const size = () => {
    const w = canvas.clientWidth || 300;
    const hgt = canvas.clientHeight || 150;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas._dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  };
  const draw = (t: number) => {
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, sw, sh);
    paint(sctx, sw, sh, t);
    renderDots(canvas, src, opts);
  };
  const loop = (now: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    if (now - lastDraw < (o.frameMs || 80)) return;
    lastDraw = now;
    draw((now - t0) / 1000);
  };
  const redraw = () => {
    size();
    draw((performance.now() - t0) / 1000);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(redraw) : null;
  ro?.observe(canvas);
  const io =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((es) => (visible = es[0].isIntersecting))
      : null;
  io?.observe(canvas);
  const onTheme = () => {
    opts.color = undefined;
    redraw();
  };
  window.addEventListener('themechange', onTheme);
  document.fonts?.ready.then(() => {
    if (!stopped) redraw();
  });
  size();
  draw(0);
  if (o.animate && !prefersReducedMotion()) raf = requestAnimationFrame(loop);
  return {
    redraw,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      window.removeEventListener('themechange', onTheme);
    },
  };
}
