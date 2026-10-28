import * as B from '@babylonjs/core';
import { canvasTex, rng } from './hall';

/** Colours for each painted scene. */
const PALETTES: Record<string, { sky: [string, string, string]; sun: [number, number, string]; far: string; mid: string; near: string; tree: [number, number, number]; mist: string; density: number }> = {
  alpine: { sky: ['#3f8fe0', '#8fc6f0', '#dcefff'], sun: [0.72, 0.3, 'rgba(255,248,220,0.95)'], far: '#7fa3c9', mid: '#4f7f8f', near: '#2f6a45', tree: [24, 90, 46], mist: 'rgba(235,245,255,0.55)', density: 1 },
  sunset: { sky: ['#4b6fc8', '#f2a56b', '#ffd9a0'], sun: [0.3, 0.55, 'rgba(255,214,150,1)'], far: '#9a7aa8', mid: '#6c5a86', near: '#35504a', tree: [20, 62, 48], mist: 'rgba(255,205,160,0.5)', density: 1 },
  pines: { sky: ['#6f9fc4', '#b9d4e2', '#e8f1f2'], sun: [0.5, 0.2, 'rgba(255,255,240,0.6)'], far: '#8aa7b4', mid: '#5f8a80', near: '#264d3a', tree: [18, 78, 52], mist: 'rgba(240,248,250,0.7)', density: 1.6 },
};

/** The painted landscape: sky, sun glow, clouds, three ridges of mountains, mist and a forest in front. */
function landscape(c: CanvasRenderingContext2D, key = 'alpine') {
  const P = PALETTES[key] ?? PALETTES.alpine;
  const W = 2048;
  const H2 = 640;
  const r = rng(77 + key.length * 13);
  const sky = c.createLinearGradient(0, 0, 0, H2);
  sky.addColorStop(0, P.sky[0]);
  sky.addColorStop(0.55, P.sky[1]);
  sky.addColorStop(1, P.sky[2]);
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H2);
  const sun = c.createRadialGradient(W * P.sun[0], H2 * P.sun[1], 10, W * P.sun[0], H2 * P.sun[1], 360);
  sun.addColorStop(0, P.sun[2]);
  sun.addColorStop(1, 'rgba(255,248,220,0)');
  c.fillStyle = sun;
  c.fillRect(0, 0, W, H2);
  for (let i = 0; i < 26; i++) {
    const x = r() * W;
    const y = 40 + r() * 230;
    const s = 60 + r() * 120;
    for (let k = 0; k < 8; k++) {
      const g = c.createRadialGradient(x + (r() - 0.5) * s * 1.6, y + (r() - 0.5) * s * 0.3, 4, x + (r() - 0.5) * s * 1.6, y, s * 0.55);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(x - s * 2, y - s, s * 4, s * 2);
    }
  }
  const ridge = (base: number, amp: number, rough: number, color: string, seed: number) => {
    const q = rng(seed);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, H2);
    for (let x = 0; x <= W; x += 16) c.lineTo(x, base - amp * (Math.sin(x / 210 + seed) * 0.5 + Math.sin(x / 90 + seed * 2) * 0.25 + Math.sin(x / 33) * rough) - q() * 4);
    c.lineTo(W, H2);
    c.closePath();
    c.fill();
  };
  ridge(430, 150, 0.1, P.far, 3);
  const mist = c.createLinearGradient(0, 330, 0, 470);
  mist.addColorStop(0, 'rgba(255,255,255,0)');
  mist.addColorStop(1, P.mist);
  c.fillStyle = mist;
  c.fillRect(0, 330, W, 140);
  ridge(490, 120, 0.14, P.mid, 8);
  ridge(560, 90, 0.16, P.near, 13);
  for (let layer = 0; layer < 3; layer++) {
    const baseY = 560 + layer * 34;
    const size = 26 + layer * 16;
    for (let x = -20; x < W + 20; x += (size * 0.55) / P.density) {
      const tx = x + r() * size * 0.4;
      const th = size * (1.3 + r() * 0.9);
      const g = P.tree[1] - layer * 24 + r() * 26;
      c.fillStyle = `rgb(${P.tree[0] + layer * 4},${g},${P.tree[2] + layer * 4})`;
      c.beginPath();
      c.moveTo(tx, baseY - th);
      c.lineTo(tx + size * 0.42, baseY);
      c.lineTo(tx - size * 0.42, baseY);
      c.closePath();
      c.fill();
    }
  }
  const fog = c.createLinearGradient(0, 600, 0, H2);
  fog.addColorStop(0, 'rgba(20,50,35,0)');
  fog.addColorStop(1, 'rgba(20,50,35,0.9)');
  c.fillStyle = fog;
  c.fillRect(0, 600, W, 40);
}

export interface BackdropItem {
  id: string;
  kind: 'painted' | 'image' | 'video';
  src: string;
  seconds: number;
}

/**
 * Puts the replaceable scenery behind a hall: three big panels (back and both sides) showing a picture or video from the
 * backdrop library, one scene fading into the next on a timer. `scenery` is 'queue' (play them all in order) or one item id.
 * `place` positions the panels so each hall can put the picture where its windows or open sides are.
 */
export function installBackdrop(
  scene: B.Scene,
  meshes: B.Mesh[],
  scenery: string,
  defaultKey: string,
  place: { back: [number, number, number, number]; left: [number, number, number, number]; right: [number, number, number, number]; y: number; w: number; h: number } = {
    back: [0, -52, Math.PI, 130],
    left: [-62, 4, -Math.PI / 2, 104],
    right: [62, 4, Math.PI / 2, 104],
    y: 15.2,
    w: 130,
    h: 40.6,
  },
) {
  // ---------------------------------------------------------------- the mountain backdrop: a U of three big panels, clearly a picture
  const mkBd = (name: string) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = B.Color3.Black();
    m.specularColor = B.Color3.Black();
    m.disableLighting = true;
    m.fogEnabled = false;
    return m;
  };
  const bdA = mkBd('backdropA');
  const bdB = mkBd('backdropB');
  bdB.alpha = 0;
  const painted = new Map<string, B.Texture>();
  const paintedTex = (key: string) => {
    let t = painted.get(key);
    if (!t) {
      t = canvasTex(scene, `landscape-${key}`, 2048, 640, (c) => landscape(c, key), 1, 1);
      painted.set(key, t);
    }
    return t;
  };
  bdA.emissiveTexture = paintedTex(defaultKey);
  const bdH = place.h;
  // each panel is drawn twice, the second a little nearer, so one scene can fade into the next
  const panel = (x: number, z: number, rotY: number, w: number, mat: B.Material, lift: number) => {
    const p = B.MeshBuilder.CreatePlane('backdrop', { width: w, height: bdH }, scene);
    p.position.set(x - Math.sin(rotY) * lift, place.y, z - Math.cos(rotY) * lift);
    p.rotation.y = rotY;
    p.material = mat;
    p.isPickable = false;
    meshes.push(p);
  };
  for (const [mat, lift] of [[bdA, 0], [bdB, 0.05]] as const) {
    for (const q of [place.back, place.left, place.right]) panel(q[0], q[1], q[2], q[3], mat, lift);
  }
  // the queue: scenery from the library changes by itself, fading from one to the next
  const texFor = (it: BackdropItem): B.Texture =>
    it.kind === 'painted'
      ? paintedTex(it.src)
      : it.kind === 'video'
        ? new B.VideoTexture('natureVideo', it.src, scene, false, true, B.VideoTexture.TRILINEAR_SAMPLINGMODE, { autoPlay: true, loop: true, muted: true, autoUpdateTexture: true })
        : new B.Texture(it.src, scene);
  let timer = 0;
  let fade = 0;
  let shown = -1;
  let queue: BackdropItem[] = [];
  const show = (i: number) => {
    const it = queue[i];
    if (!it || i === shown) return;
    shown = i;
    const t = texFor(it);
    bdB.emissiveTexture = t;
    bdB.alpha = 0;
    cancelAnimationFrame(fade);
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 2200);
      bdB.alpha = k;
      if (k < 1) fade = requestAnimationFrame(step);
      else {
        bdA.emissiveTexture = t;
        bdB.alpha = 0;
      }
    };
    fade = requestAnimationFrame(step);
  };
  const next = (i: number) => {
    show(i);
    if (queue.length > 1) timer = window.setTimeout(() => next((i + 1) % queue.length), Math.max(20, queue[i]?.seconds ?? 90) * 1000);
  };
  void (async () => {
    try {
      const { api } = await import('@/lib/api/client');
      const all = (await api<{ items: BackdropItem[] }>('/backdrops')).items;
      queue = scenery === 'queue' ? all : all.filter((x) => x.id === scenery);
      if (!queue.length) queue = all;
    } catch {
      // not signed in (the demo): the painted scenes still play
      queue = ['alpine', 'sunset', 'pines'].map((k) => ({ id: `preset-${k}`, kind: 'painted' as const, src: k, seconds: 90 }));
      const one = queue.filter((x) => x.id === scenery);
      if (one.length) queue = one;
    }
    if (queue.length) next(0);
  })();
  scene.onDisposeObservable.add(() => {
    window.clearTimeout(timer);
    cancelAnimationFrame(fade);
  });
}
