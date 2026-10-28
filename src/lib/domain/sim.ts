/* Shared physics for the 2D lesson demos and the 3D classroom models. Pure TypeScript, no DOM. */
import { clamp } from '../util';

export const G_EARTH = 9.8;
export type SimKind = 'cart' | 'projectile' | 'pendulum' | 'orbit';

export interface ParamSpec {
  k: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  def: number;
}

export const SIM_SPECS: Record<SimKind, { title: string; params: ParamSpec[] }> = {
  cart: {
    title: 'Force on a cart',
    params: [
      { k: 'mass', label: 'Mass', unit: 'kg', min: 0.5, max: 10, step: 0.5, def: 2 },
      { k: 'force', label: 'Applied force', unit: 'N', min: -20, max: 20, step: 1, def: 6 },
      { k: 'friction', label: 'Friction μ', unit: '', min: 0, max: 0.6, step: 0.02, def: 0.1 },
      { k: 'v0', label: 'Start velocity', unit: 'm/s', min: -5, max: 5, step: 0.5, def: 0 },
    ],
  },
  projectile: {
    title: 'Projectile',
    params: [
      { k: 'speed', label: 'Launch speed', unit: 'm/s', min: 5, max: 30, step: 1, def: 18 },
      { k: 'angle', label: 'Launch angle', unit: '°', min: 5, max: 85, step: 1, def: 45 },
      { k: 'gravity', label: 'Gravity', unit: 'm/s²', min: 1.6, max: 20, step: 0.2, def: 9.8 },
    ],
  },
  pendulum: {
    title: 'Pendulum',
    params: [
      { k: 'length', label: 'Length', unit: 'm', min: 0.5, max: 3, step: 0.1, def: 1.5 },
      { k: 'angle', label: 'Release angle', unit: '°', min: 5, max: 80, step: 1, def: 35 },
      { k: 'gravity', label: 'Gravity', unit: 'm/s²', min: 1.6, max: 20, step: 0.2, def: 9.8 },
    ],
  },
  orbit: {
    title: 'Orbit',
    params: [
      { k: 'radius', label: 'Start radius', unit: 'u', min: 1.5, max: 6, step: 0.25, def: 4 },
      { k: 'orbitMass', label: 'Central mass', unit: 'M', min: 20, max: 100, step: 5, def: 60 },
      { k: 'vfac', label: 'Speed vs circular', unit: '×', min: 0.5, max: 1.5, step: 0.05, def: 1 },
    ],
  },
};

export type SimParamValues = Record<string, number>;

export function simDefaults(kind: SimKind): SimParamValues {
  const o: SimParamValues = {};
  SIM_SPECS[kind].params.forEach((s) => (o[s.k] = s.def));
  return o;
}

/** One flat state record covers all four simulations; each only touches its own fields. */
export interface SimState {
  x: number;
  y: number;
  v: number;
  a: number;
  fr: number;
  hit: boolean;
  vx: number;
  vy: number;
  maxY: number;
  landed: boolean;
  th: number;
  w: number;
  maxW: number;
  T: number;
  cross: number[];
  GM: number;
  crashed: boolean;
  rMin: number;
  rMax: number;
}

export type Readout = [label: string, value: string, unit: string];

export interface Sim {
  kind: SimKind;
  p: SimParamValues;
  s: SimState;
  trail: [number, number][];
  t: number;
  running: boolean;
  done: boolean;
  reset(over?: SimParamValues): void;
  pos(): [number, number];
  step(dt: number): void;
  readouts(): Readout[];
  summary(): string;
}

const rad = (d: number) => (d * Math.PI) / 180;
const blankState = (): SimState => ({
  x: 0,
  y: 0,
  v: 0,
  a: 0,
  fr: 0,
  hit: false,
  vx: 0,
  vy: 0,
  maxY: 0,
  landed: false,
  th: 0,
  w: 0,
  maxW: 0,
  T: 0,
  cross: [],
  GM: 0,
  crashed: false,
  rMin: 0,
  rMax: 0,
});

const f2 = (v: number, d = 2) => (Math.abs(v) < Math.pow(10, -d) / 2 ? 0 : v).toFixed(d);

export function makeSim(kind: SimKind, over?: SimParamValues): Sim {
  const p: SimParamValues = { ...simDefaults(kind), ...(over ?? {}) };
  const S: Sim = {
    kind,
    p,
    s: blankState(),
    trail: [],
    t: 0,
    running: false,
    done: false,
    reset(o) {
      if (o) Object.assign(p, o);
      S.t = 0;
      S.trail = [];
      S.done = false;
      const b = blankState();
      if (kind === 'cart') S.s = { ...b, x: -6, v: p.v0 };
      else if (kind === 'projectile')
        S.s = { ...b, vx: p.speed * Math.cos(rad(p.angle)), vy: p.speed * Math.sin(rad(p.angle)) };
      else if (kind === 'pendulum') S.s = { ...b, th: rad(p.angle) };
      else {
        const GM = p.orbitMass * 0.25;
        const r = p.radius;
        S.s = { ...b, x: r, vy: Math.sqrt(GM / r) * p.vfac, GM, rMin: r, rMax: r };
      }
      S.trail.push(S.pos());
    },
    pos() {
      const s = S.s;
      if (kind === 'cart') return [s.x, 0];
      if (kind === 'pendulum') return [Math.sin(s.th) * p.length, -Math.cos(s.th) * p.length];
      return [s.x, s.y];
    },
    step(dt) {
      const s = S.s;
      if (kind === 'cart') {
        const m = p.mass;
        const fk = p.friction * m * G_EARTH;
        const F = p.force;
        if (Math.abs(s.v) < 1e-3 && Math.abs(F) <= fk) {
          s.v = 0;
          s.a = 0;
          s.fr = -F;
        } else {
          const dir = Math.abs(s.v) > 1e-3 ? Math.sign(s.v) : Math.sign(F);
          const net = F - dir * fk;
          s.fr = -dir * fk;
          const nv = s.v + (net / m) * dt;
          if (Math.abs(s.v) > 1e-3 && Math.sign(nv) !== Math.sign(s.v) && Math.abs(F) <= fk) {
            s.v = 0;
            s.a = 0;
          } else {
            s.a = net / m;
            s.v = nv;
          }
        }
        s.x += s.v * dt;
        if (s.x > 10) {
          s.x = 10;
          s.v = 0;
          s.hit = true;
        }
        if (s.x < -10) {
          s.x = -10;
          s.v = 0;
          s.hit = true;
        }
      } else if (kind === 'projectile') {
        if (s.landed) return;
        s.vy -= p.gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.maxY = Math.max(s.maxY, s.y);
        if (s.y <= 0 && S.t > 0.02) {
          s.y = 0;
          s.landed = true;
          S.done = true;
        }
      } else if (kind === 'pendulum') {
        const sub = 8;
        const d = dt / sub;
        for (let i = 0; i < sub; i++) {
          const prev = s.th;
          s.w += -(p.gravity / p.length) * Math.sin(s.th) * d;
          s.th += s.w * d;
          if (prev < 0 && s.th >= 0 && s.w > 0) {
            s.cross.push(S.t + i * d);
            if (s.cross.length > 1) s.T = s.cross[s.cross.length - 1] - s.cross[s.cross.length - 2];
          }
        }
        s.maxW = Math.max(s.maxW, Math.abs(s.w));
      } else {
        if (s.crashed) return;
        const sub = 20;
        const d = dt / sub;
        for (let i = 0; i < sub; i++) {
          let r2 = s.x * s.x + s.y * s.y;
          let r = Math.sqrt(r2);
          const k = -s.GM / (r2 * r);
          s.vx += k * s.x * d * 0.5;
          s.vy += k * s.y * d * 0.5;
          s.x += s.vx * d;
          s.y += s.vy * d;
          r2 = s.x * s.x + s.y * s.y;
          r = Math.sqrt(r2);
          const k2 = -s.GM / (r2 * r);
          s.vx += k2 * s.x * d * 0.5;
          s.vy += k2 * s.y * d * 0.5;
          s.rMin = Math.min(s.rMin, r);
          s.rMax = Math.max(s.rMax, r);
          if (r < 0.35) {
            s.crashed = true;
            S.done = true;
            break;
          }
        }
      }
      S.t += dt;
      const pos = S.pos();
      const last = S.trail[S.trail.length - 1];
      if (!last || Math.hypot(pos[0] - last[0], pos[1] - last[1]) > (kind === 'orbit' ? 0.05 : 0.08)) {
        S.trail.push(pos);
        if (S.trail.length > (kind === 'orbit' ? 700 : 400)) S.trail.shift();
      }
    },
    readouts() {
      const s = S.s;
      if (kind === 'cart') {
        const net = p.force + (s.fr || 0);
        const stuck = Math.abs(s.v) < 1e-3 && Math.abs(p.force) <= p.friction * p.mass * G_EARTH;
        return [
          ['Time', f2(S.t, 1), 's'],
          ['Position', f2(s.x, 1), 'm'],
          ['Velocity', f2(s.v), 'm/s'],
          ['Net force', f2(stuck ? 0 : net, 1), 'N'],
          ['Acceleration', f2(s.a), 'm/s²'],
        ];
      }
      if (kind === 'projectile') {
        const R = (p.speed * p.speed * Math.sin(2 * rad(p.angle))) / p.gravity;
        const T = (2 * p.speed * Math.sin(rad(p.angle))) / p.gravity;
        const H = Math.pow(p.speed * Math.sin(rad(p.angle)), 2) / (2 * p.gravity);
        return [
          ['Time', f2(S.t, 2), 's'],
          ['Distance', f2(s.x, 1), 'm'],
          ['Height', f2(s.y, 1), 'm'],
          ['Speed', f2(Math.hypot(s.vx, s.vy), 1), 'm/s'],
          ['Predicted range', f2(R, 1), 'm'],
          ['Predicted flight time', f2(T, 2), 's'],
          ['Predicted peak', f2(H, 1), 'm'],
        ];
      }
      if (kind === 'pendulum') {
        const T0 = 2 * Math.PI * Math.sqrt(p.length / p.gravity);
        const v = Math.abs(s.w) * p.length;
        const h0 = p.length * (1 - Math.cos(rad(p.angle)));
        const hh = p.length * (1 - Math.cos(s.th));
        return [
          ['Time', f2(S.t, 1), 's'],
          ['Angle', f2((s.th * 180) / Math.PI, 0), '°'],
          ['Speed', f2(v, 2), 'm/s'],
          ['Height above lowest', f2(hh, 2), 'm'],
          ['Small-angle period', f2(T0, 2), 's'],
          ['Measured period', s.T ? f2(s.T, 2) : '…', 's'],
          ['KE share of energy', f2(h0 > 0 ? Math.max(0, 1 - hh / h0) * 100 : 0, 0), '%'],
        ];
      }
      const r = Math.hypot(s.x, s.y);
      const v = Math.hypot(s.vx, s.vy);
      const vc = Math.sqrt(s.GM / r);
      const E = (v * v) / 2 - s.GM / r;
      const a = -s.GM / (2 * E);
      const T = E < 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / s.GM) : Infinity;
      return [
        ['Time', f2(S.t, 1), 's'],
        ['Distance r', f2(r, 2), 'u'],
        ['Speed', f2(v, 2), 'u/s'],
        ['Circular speed here', f2(vc, 2), 'u/s'],
        ['Period (model)', isFinite(T) ? f2(T, 1) : 'escapes', isFinite(T) ? 's' : ''],
        ['Closest / farthest', `${f2(s.rMin, 1)} / ${f2(s.rMax, 1)}`, 'u'],
        ['State', s.crashed ? 'fell in' : E >= 0 ? 'escaping' : 'bound', ''],
      ];
    },
    summary() {
      const s = S.s;
      if (kind === 'cart')
        return `Net force ${f2(p.force + (s.fr || 0), 1)} N on ${p.mass} kg gives ${f2(s.a)} m/s².`;
      if (kind === 'projectile')
        return s.landed
          ? `Landed after ${f2(S.t, 2)} s at ${f2(s.x, 1)} m.`
          : `In flight: ${f2(s.x, 1)} m out, ${f2(s.y, 1)} m up.`;
      if (kind === 'pendulum')
        return `Angle ${f2((s.th * 180) / Math.PI, 0)}°, speed ${f2(Math.abs(s.w) * p.length, 2)} m/s.`;
      return `Distance ${f2(Math.hypot(s.x, s.y), 2)} u from the centre.`;
    },
  };
  S.reset();
  return S;
}

export interface SimPalette {
  fg: string;
  fg3: string;
  line: string;
  blue: string;
  green: string;
  amber: string;
  red: string;
  violet: string;
  mono: string;
}

/** 2D canvas renderer for the lesson-page demos. `c` carries resolved theme colours (see cssVar). */
export function drawSim2D(
  S: Sim,
  ctx: CanvasRenderingContext2D,
  w: number,
  hgt: number,
  c: SimPalette,
): void {
  ctx.clearRect(0, 0, w, hgt);
  ctx.lineWidth = 1.5;
  ctx.font = `11px ${c.mono || 'monospace'}`;
  const s = S.s;
  const p = S.p;
  const arrow = (x1: number, y1: number, x2: number, y2: number, col: string, label: string) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (Math.hypot(dx, dy) < 3) return;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4));
    ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
    if (label) ctx.fillText(label, x2 + (dx >= 0 ? 6 : -ctx.measureText(label).width - 6), y2 - 6);
    ctx.lineWidth = 1.5;
  };
  const poly = (X: (v: number) => number, Y: (v: number) => number) => {
    ctx.beginPath();
    S.trail.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1]))));
    ctx.stroke();
  };

  if (S.kind === 'cart') {
    const gx = (x: number) => w / 2 + x * (w / 24);
    const gy = hgt * 0.7;
    ctx.strokeStyle = c.line;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
    for (let m = -10; m <= 10; m += 2) {
      ctx.beginPath();
      ctx.moveTo(gx(m), gy);
      ctx.lineTo(gx(m), gy + 6);
      ctx.stroke();
      ctx.fillStyle = c.fg3;
      ctx.fillText(`${m}`, gx(m) - 6, gy + 20);
    }
    const cw = 30 + p.mass * 5;
    const ch = 24 + p.mass * 2.5;
    const x0 = gx(s.x);
    ctx.fillStyle = c.blue;
    ctx.beginPath();
    ctx.roundRect(x0 - cw / 2, gy - ch - 8, cw, ch, 6);
    ctx.fill();
    ctx.fillStyle = c.fg;
    [-1, 1].forEach((k) => {
      ctx.beginPath();
      ctx.arc(x0 + k * cw * 0.3, gy - 4, 6, 0, 7);
      ctx.fill();
    });
    ctx.fillStyle = '#fff';
    ctx.fillText(`${p.mass} kg`, x0 - 14, gy - ch / 2 - 4);
    const my = gy - ch / 2 - 8;
    arrow(
      x0 + (Math.sign(p.force) * cw) / 2,
      my - 18,
      x0 + (Math.sign(p.force) * cw) / 2 + p.force * 4,
      my - 18,
      c.green,
      Math.abs(p.force) > 0 ? `F ${p.force} N` : '',
    );
    if (s.fr)
      arrow(
        x0 - Math.sign(s.fr) * (-cw / 2),
        my + 8,
        x0 + s.fr * 4 + Math.sign(s.fr) * (-cw / 2) * -1,
        my + 8,
        c.red,
        `f ${Math.abs(Math.round(s.fr * 10) / 10)} N`,
      );
  } else if (S.kind === 'projectile') {
    const R = Math.max(
      10,
      ((p.speed * p.speed * Math.sin((2 * p.angle * Math.PI) / 180)) / p.gravity) * 1.15,
    );
    const H = Math.max(
      4,
      (Math.pow(p.speed * Math.sin((p.angle * Math.PI) / 180), 2) / (2 * p.gravity)) * 1.3,
    );
    const sc = Math.min((w - 60) / R, (hgt - 60) / H);
    const ox = 30;
    const oy = hgt - 30;
    const X = (x: number) => ox + x * sc;
    const Y = (y: number) => oy - y * sc;
    ctx.strokeStyle = c.line;
    ctx.beginPath();
    ctx.moveTo(0, oy);
    ctx.lineTo(w, oy);
    ctx.stroke();
    const step = R > 80 ? 20 : R > 40 ? 10 : 5;
    for (let m = 0; m <= R; m += step) {
      ctx.fillStyle = c.fg3;
      ctx.fillText(`${m} m`, X(m) - 10, oy + 16);
      ctx.beginPath();
      ctx.moveTo(X(m), oy);
      ctx.lineTo(X(m), oy + 5);
      ctx.stroke();
    }
    ctx.strokeStyle = c.fg3;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    const T = (2 * p.speed * Math.sin((p.angle * Math.PI) / 180)) / p.gravity;
    for (let i = 0; i <= 60; i++) {
      const t = (T * i) / 60;
      const x = p.speed * Math.cos((p.angle * Math.PI) / 180) * t;
      const y = p.speed * Math.sin((p.angle * Math.PI) / 180) * t - (p.gravity * t * t) / 2;
      if (i) ctx.lineTo(X(x), Y(y));
      else ctx.moveTo(X(x), Y(y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = c.blue;
    ctx.lineWidth = 2.5;
    poly(X, Y);
    ctx.fillStyle = c.amber;
    ctx.beginPath();
    ctx.arc(X(s.x), Y(s.y), 7, 0, 7);
    ctx.fill();
    if (!s.landed) {
      arrow(X(s.x), Y(s.y), X(s.x) + s.vx * sc * 0.35, Y(s.y), c.green, '');
      arrow(X(s.x), Y(s.y), X(s.x), Y(s.y) - s.vy * sc * 0.35, c.violet, '');
    }
    ctx.fillStyle = c.fg3;
    ctx.fillText('dashed: predicted path · green: horizontal velocity · violet: vertical velocity', 12, 16);
  } else if (S.kind === 'pendulum') {
    const L = p.length;
    const sc = Math.min(
      (hgt - 70) / L,
      (w / 2 - 30) / (L * Math.sin(Math.max(0.2, (p.angle * Math.PI) / 180)) + 0.3),
    );
    const ox = w / 2;
    const oy = 28;
    const bx = ox + Math.sin(s.th) * L * sc;
    const by = oy + Math.cos(s.th) * L * sc;
    ctx.strokeStyle = c.line;
    ctx.beginPath();
    ctx.moveTo(ox - 60, oy);
    ctx.lineTo(ox + 60, oy);
    ctx.stroke();
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox, oy + L * sc + 20);
    ctx.stroke();
    ctx.setLineDash([]);
    const a0 = (p.angle * Math.PI) / 180;
    ctx.strokeStyle = c.fg3;
    ctx.beginPath();
    ctx.arc(ox, oy, L * sc, Math.PI / 2 - a0, Math.PI / 2 + a0);
    ctx.stroke();
    ctx.strokeStyle = c.fg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.fillStyle = c.blue;
    ctx.beginPath();
    ctx.arc(bx, by, 14, 0, 7);
    ctx.fill();
    const hAbove = (1 - Math.cos(s.th)) * L;
    const h0 = (1 - Math.cos(a0)) * L;
    const share = h0 > 0 ? clamp(hAbove / h0, 0, 1) : 0;
    const bx0 = w - 70;
    const by0 = hgt - 30;
    ctx.fillStyle = c.fg3;
    ctx.fillText('ENERGY', bx0 - 4, by0 - 112);
    ctx.fillStyle = c.violet;
    ctx.fillRect(bx0, by0 - 100 * share, 24, 100 * share);
    ctx.fillStyle = c.green;
    ctx.fillRect(bx0, by0 - 100, 24, 100 * (1 - share));
    ctx.fillStyle = c.fg3;
    ctx.fillText('PE', bx0 + 30, by0 - 50 * share);
    ctx.fillText('KE', bx0 + 30, by0 - 100 + 50 * (1 - share) + 4);
  } else {
    const sc = Math.min(w, hgt) / 2 / Math.max(6.5, p.radius * 1.4);
    const ox = w / 2;
    const oy = hgt / 2;
    const X = (x: number) => ox + x * sc;
    const Y = (y: number) => oy - y * sc;
    ctx.strokeStyle = c.line;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.arc(ox, oy, p.radius * sc, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = c.blue;
    ctx.lineWidth = 1.8;
    poly(X, Y);
    const cr = 10 + p.orbitMass / 8;
    const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, cr * 2);
    g.addColorStop(0, c.amber);
    g.addColorStop(1, 'rgba(255,184,77,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ox, oy, cr * 2, 0, 7);
    ctx.fill();
    ctx.fillStyle = c.amber;
    ctx.beginPath();
    ctx.arc(ox, oy, cr * 0.7, 0, 7);
    ctx.fill();
    if (!s.crashed) {
      ctx.fillStyle = c.fg;
      ctx.beginPath();
      ctx.arc(X(s.x), Y(s.y), 6, 0, 7);
      ctx.fill();
      const vs = 1.1 * sc;
      arrow(X(s.x), Y(s.y), X(s.x) + s.vx * vs, Y(s.y) - s.vy * vs, c.green, 'v');
      const r = Math.hypot(s.x, s.y);
      const ga = s.GM / (r * r);
      arrow(
        X(s.x),
        Y(s.y),
        X(s.x) - (s.x / r) * ga * sc * 0.9,
        Y(s.y) + (s.y / r) * ga * sc * 0.9,
        c.violet,
        'g',
      );
    } else {
      ctx.fillStyle = c.red;
      ctx.fillText('The satellite fell into the central body.', 12, 18);
    }
  }
}
