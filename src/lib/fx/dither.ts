import { clamp, seeded } from '../util';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);

export function isLightTheme(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  return (
    t === 'light' || t === 'playful' || t === 'wondering' || t === 'instagram' || t === 'brilliant' ||
    (t !== 'dark' && t !== 'scenic' && t !== 'worldlab' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches)
  );
}

function lightStops(n: number): string[] {
  const r = ['#243ac0', '#3f5ff0', '#5f86ff', '#7fb0ff', '#a8d8ff'].map((c) =>
    [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)),
  );
  return Array.from({ length: n }, (_, i) => {
    const f = (i / Math.max(1, n - 1)) * (r.length - 1);
    const a = Math.floor(f);
    const b = Math.min(r.length - 1, a + 1);
    const t = f - a;
    return (
      '#' +
      r[a]
        .map((v, k) =>
          Math.round(v + (r[b][k] - v) * t)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  });
}

export interface DitherOptions {
  cell: number;
  stops: string[];
  angle: number;
  seed: number;
  spread: number;
}

/** Bayer-dithered gradient panel in the manner of Memorable's step images. */
export function ditherPanel(canvas: HTMLCanvasElement, opts: Partial<DitherOptions> = {}): void {
  const o: DitherOptions = {
    cell: 6,
    stops: ['#0b0720', '#2a1068', '#7c4dff', '#d46bff', '#ff9f6b'],
    angle: 1.2,
    seed: 3,
    spread: 0.55,
    ...opts,
  };
  if (isLightTheme()) o.stops = lightStops(o.stops.length);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || 300;
  const H = canvas.clientHeight || 160;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cell = o.cell * dpr;
  const cols = Math.ceil(canvas.width / cell);
  const rows = Math.ceil(canvas.height / cell);
  const rng = seeded(o.seed);
  const noise: number[] = [];
  for (let i = 0; i < 64; i++) noise.push(rng());
  const g = (a: number, b: number) => noise[(a & 7) * 8 + (b & 7)];
  const mix = (u: number, v: number, t: number) => u + (v - u) * (t * t * (3 - 2 * t));
  const nz = (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      fx = x - xi,
      fy = y - yi;
    return mix(mix(g(xi, yi), g(xi + 1, yi), fx), mix(g(xi, yi + 1), g(xi + 1, yi + 1), fx), fy);
  };
  const n = o.stops.length;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const gx = x / cols,
        gy = y / rows;
      let v = gy * 0.8 + (gx - 0.5) * (o.angle - 1) * 0.5 + nz(x * 0.12, y * 0.12) * 0.38 - 0.12;
      v = clamp(v, 0, 0.999) * (n - 1);
      const base = Math.floor(v),
        frac = v - base;
      const thr = BAYER[(y % 4) * 4 + (x % 4)];
      const level = clamp(base + (frac + (thr - 0.5) * o.spread > 0.5 ? 1 : 0), 0, n - 1);
      ctx.fillStyle = o.stops[level];
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}
