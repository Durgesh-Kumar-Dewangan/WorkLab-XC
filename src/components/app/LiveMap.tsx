'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { arcPoints, borderLines, landRings, project } from '@/lib/globe';

interface Place {
  country: string;
  name: string;
  region: string;
  n: number;
  online: number;
}
interface Live {
  now: number;
  online: number;
  total: number;
  located: number;
  paid: number;
  newOnline: number;
  returningOnline: number;
  points: [number, number, number, number][];
  pins: { name: string; lat: number; lon: number; n: number; online: number }[];
  top: Place[];
  feed: { at: number; kind: string; text: string }[];
  arcs: { from: [number, number]; to: [number, number] }[];
  plans30d: { item: string; n: number }[];
  orders24h: number;
}

const REGIONS: Record<string, { name: string; lon: number; lat: number; zoom: number }> = {
  world: { name: 'World', lon: 20, lat: 20, zoom: 1 },
  asia: { name: 'Asia', lon: 95, lat: 30, zoom: 1.7 },
  europe: { name: 'Europe', lon: 12, lat: 50, zoom: 2 },
  africa: { name: 'Africa', lon: 20, lat: 2, zoom: 1.5 },
  na: { name: 'North America', lon: -100, lat: 40, zoom: 1.7 },
  sa: { name: 'South America', lon: -60, lat: -15, zoom: 1.7 },
  oceania: { name: 'Oceania', lon: 135, lat: -25, zoom: 1.9 },
};
const PLAN_NAME: Record<string, string> = {
  learner: 'Beta',
  plus: 'Beta Plus',
  classroom: 'Classroom',
  unit_notes: 'Unit notes',
  monthly_notes: 'Unlimited notes',
  chatbot: 'AI tutor chat',
  pack: 'Study pack',
  noads: 'Ad-free',
};
/** Colours for the map, worked out from the page's own theme so it looks at home in every one of them. */
function palette(el: HTMLElement, dark: boolean) {
  const st = getComputedStyle(el);
  const v = (n: string, d: string) => st.getPropertyValue(n).trim() || d;
  const bg = v('--bg', dark ? '#0b0b12' : '#ffffff');
  const panel = v('--panel', bg);
  const fg = v('--fg', dark ? '#eeeeee' : '#111111');
  const blue = v('--blue', '#4f6bff');
  const mix = (c: string, pct: number, into: string) => `color-mix(in srgb, ${c} ${pct}%, ${into})`;
  return {
    green: dark ? '#22e07a' : '#0e9f55',
    red: dark ? '#ff4d5e' : '#e03144',
    arc: dark ? '192,110,255' : '124,58,237',
    halo0: mix(blue, dark ? 55 : 30, 'transparent'),
    halo1: mix(blue, dark ? 20 : 10, 'transparent'),
    halo2: mix(blue, 0, 'transparent'),
    sea0: mix(blue, dark ? 38 : 20, panel),
    sea1: mix(blue, dark ? 18 : 12, bg),
    sea2: mix(blue, dark ? 8 : 6, bg),
    land: dark ? mix('#000000', 45, panel) : mix(fg, 13, bg),
    edge: mix(fg, dark ? 26 : 30, 'transparent'),
    shade: dark ? 'rgba(5,4,20,0.5)' : 'rgba(30,40,80,0.13)',
    pinEdge: dark ? '#ffffff' : '#ffffff',
  };
}
const GREEN = 'var(--lm-on)';
const RED = 'var(--lm-off)';

/** The live map: a glowing globe with a dot for every learner (green using the app now, red offline), payments arcing in, and the numbers beside it. */
export function LiveMap() {
  const [data, setData] = useState<Live | null>(null);
  const [error, setError] = useState('');
  const [region, setRegion] = useState('world');
  const [showOff, setShowOff] = useState(true);
  const [tick, setTick] = useState(0);
  const [dark, setDark] = useState(true);
  const darkRef = useRef(true);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({
    lon: 20,
    lat: 20,
    zoom: 1,
    spin: true,
    drag: false,
    x: 0,
    y: 0,
    to: null as null | { lon: number; lat: number; zoom: number },
  });
  const live = useRef<Live | null>(null);
  const off = useRef(true);
  const rings = useMemo(landRings, []);
  const borders = useMemo(borderLines, []);
  const arcs = useMemo(() => (data?.arcs ?? []).map((a) => arcPoints(a.from, a.to)), [data]);

  useEffect(() => {
    live.current = data;
  }, [data]);
  useEffect(() => {
    off.current = showOff;
  }, [showOff]);

  // follow the selected theme: light or dark page, and its own colours
  useEffect(() => {
    const check = () => {
      const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
      const [r, g, b] = (m ?? ['0', '0', '0']).map(Number);
      const d = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
      darkRef.current = d;
      setDark(d);
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { attributes: true });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', check);
    window.addEventListener('themechange', check);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', check);
      window.removeEventListener('themechange', check);
    };
  }, []);

  // fresh numbers every 10 seconds
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Live>('/admin/live')
        .then((d) => alive && (setData(d), setError('')))
        .catch(
          (e) =>
            alive &&
            setError(
              e instanceof ApiFail && e.status === 403
                ? 'Only admins can see the live map.'
                : 'Could not load the live map.',
            ),
        );
    load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // the line at the bottom of the globe moves on every few seconds
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(id);
  }, []);

  const fly = useCallback((lon: number, lat: number, zoom: number) => {
    view.current.spin = false;
    view.current.to = { lon, lat: Math.max(-65, Math.min(65, lat)), zoom };
  }, []);
  const pickRegion = (k: string) => {
    setRegion(k);
    const r = REGIONS[k];
    fly(r.lon, r.lat, r.zoom);
    if (k === 'world') view.current.spin = true;
  };

  useEffect(() => {
    let id = 0;
    const frame = () => {
      id = requestAnimationFrame(frame);
      const c = canvas.current;
      const d = live.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const g = c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const v = view.current;
      if (v.to) {
        let dl = v.to.lon - v.lon;
        dl = ((((dl + 180) % 360) + 360) % 360) - 180;
        v.lon += dl * 0.08;
        v.lat += (v.to.lat - v.lat) * 0.08;
        v.zoom += (v.to.zoom - v.zoom) * 0.08;
        if (Math.abs(dl) < 0.1 && Math.abs(v.to.lat - v.lat) < 0.1 && Math.abs(v.to.zoom - v.zoom) < 0.01)
          v.to = null;
      } else if (v.spin && !v.drag && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        v.lon += 0.12;
      const cx = w / 2;
      const cy = h / 2;
      const P = palette(c, darkRef.current);
      const r = (Math.min(w, h) / 2) * 0.84 * v.zoom;
      const now = performance.now();

      // glow around the planet
      const halo = g.createRadialGradient(cx, cy, r * 0.97, cx, cy, r * 1.28);
      halo.addColorStop(0, P.halo0);
      halo.addColorStop(0.35, P.halo1);
      halo.addColorStop(1, P.halo2);
      g.fillStyle = halo;
      g.beginPath();
      g.arc(cx, cy, r * 1.28, 0, Math.PI * 2);
      g.fill();

      // ocean
      const sea = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      sea.addColorStop(0, P.sea0);
      sea.addColorStop(0.6, P.sea1);
      sea.addColorStop(1, P.sea2);
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = sea;
      g.fill();

      // land
      g.save();
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = P.land;
      g.strokeStyle = P.edge;
      g.lineWidth = 0.7;
      for (const ring of rings) {
        g.beginPath();
        let first = true;
        for (const [lo, la] of ring) {
          const p = project(lo, la, v.lon, v.lat, r, cx, cy);
          if (p.z <= 0) {
            // behind the globe: slide the point out to the edge so the outline hugs the rim instead of cutting across
            const dx = p.x - cx;
            const dy = p.y - cy;
            const len = Math.hypot(dx, dy) || 1;
            p.x = cx + (dx / len) * r;
            p.y = cy + (dy / len) * r;
          }
          if (first) g.moveTo(p.x, p.y);
          else g.lineTo(p.x, p.y);
          first = false;
        }
        g.closePath();
        g.fill();
        g.stroke();
      }
      // country borders, only where they face us
      g.strokeStyle = P.edge;
      g.globalAlpha = 0.7;
      g.lineWidth = 0.6;
      for (const line of borders) {
        g.beginPath();
        let pen = false;
        for (const [lo, la] of line) {
          const p = project(lo, la, v.lon, v.lat, r, cx, cy);
          if (p.z > 0) (pen ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y), (pen = true));
          else pen = false;
        }
        g.stroke();
      }
      g.globalAlpha = 1;
      g.restore();

      // shade the far edge so it reads as a ball
      const shade = g.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.5, cx, cy, r);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, P.shade);
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fillStyle = shade;
      g.fill();

      if (d) {
        const k = Math.sqrt(v.zoom);
        // offline learners: small red dots
        if (off.current) {
          g.fillStyle = P.red;
          g.globalAlpha = 0.75;
          for (const [la, lo, on] of d.points) {
            if (on) continue;
            const p = project(lo, la, v.lon, v.lat, r, cx, cy);
            if (p.z < 0.05) continue;
            g.beginPath();
            g.arc(p.x, p.y, 1.5 * k, 0, Math.PI * 2);
            g.fill();
          }
          g.globalAlpha = 1;
        }
        // payments arcing in
        arcs.forEach((pts, i) => {
          const t = ((now / 2600 + i * 0.17) % 1.25) / 1.25;
          const upto = Math.floor(t * pts.length);
          g.lineWidth = 1.6;
          for (let j = Math.max(1, upto - 18); j < upto; j++) {
            const a = project(pts[j - 1][1], pts[j - 1][0], v.lon, v.lat, r * (1 + pts[j - 1][2]), cx, cy);
            const b = project(pts[j][1], pts[j][0], v.lon, v.lat, r * (1 + pts[j][2]), cx, cy);
            if (a.z < 0 || b.z < 0) continue;
            g.strokeStyle = `rgba(${P.arc},${((j - (upto - 18)) / 18) * 0.9})`;
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(b.x, b.y);
            g.stroke();
          }
          const tail = pts[pts.length - 1];
          const e = project(tail[1], tail[0], v.lon, v.lat, r, cx, cy);
          if (e.z > 0.05) {
            g.beginPath();
            g.arc(e.x, e.y, 4, 0, Math.PI * 2);
            g.strokeStyle = `rgba(${P.arc},0.9)`;
            g.lineWidth = 1.5;
            g.stroke();
          }
        });
        // learners using the app now: green, glowing, with a ring that spreads out
        g.shadowColor = P.green;
        g.shadowBlur = 8;
        let rung = 0;
        for (const [la, lo, on] of d.points) {
          if (!on) continue;
          const p = project(lo, la, v.lon, v.lat, r, cx, cy);
          if (p.z < 0.05) continue;
          g.fillStyle = P.green;
          g.beginPath();
          g.arc(p.x, p.y, 2.6 * k, 0, Math.PI * 2);
          g.fill();
          if (rung++ < 80) {
            const t = ((now + la * 37 + lo * 17) % 2000) / 2000;
            g.shadowBlur = 0;
            g.strokeStyle = `${P.green}${Math.round((1 - t) * 150)
              .toString(16)
              .padStart(2, '0')}`;
            g.lineWidth = 1.2;
            g.beginPath();
            g.arc(p.x, p.y, 3 + t * 12 * k, 0, Math.PI * 2);
            g.stroke();
            g.shadowBlur = 8;
          }
        }
        g.shadowBlur = 0;
        // pins: a map pin on every place with learners, green when someone there is online, red when nobody is
        const pinned = [...d.pins].sort((a, b) => b.lat - a.lat);
        for (const q of pinned) {
          const p = project(q.lon, q.lat, v.lon, v.lat, r, cx, cy);
          if (p.z < 0.12) continue;
          const R = (4.5 + 5 * Math.sqrt(q.n / Math.max(1, d.pins[0]?.n ?? 1))) * Math.sqrt(v.zoom);
          const col = q.online > 0 ? P.green : P.red;
          const x = p.x;
          const y = p.y;
          g.beginPath();
          g.ellipse(x, y, R * 0.55, R * 0.22, 0, 0, Math.PI * 2);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fill();
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - R * 0.86, y - R * 1.5);
          g.arc(x, y - R * 2, R, Math.PI * 0.83, Math.PI * 0.17, false);
          g.lineTo(x, y);
          g.closePath();
          g.fillStyle = col;
          g.fill();
          g.lineWidth = 1.5;
          g.strokeStyle = P.pinEdge;
          g.stroke();
          g.beginPath();
          g.arc(x, y - R * 2, R * 0.42, 0, Math.PI * 2);
          g.fillStyle = '#ffffff';
          g.fill();
          if (v.zoom >= 1.5) {
            g.font = '600 11px system-ui, sans-serif';
            g.textAlign = 'center';
            g.lineWidth = 3;
            g.strokeStyle = 'rgba(0,0,0,0.35)';
            g.fillStyle = '#ffffff';
            const label = `${q.name} · ${q.online}/${q.n}`;
            g.strokeText(label, x, y + 14);
            g.fillText(label, x, y + 14);
          }
          if (q.online > 0) {
            const t = ((now + q.lat * 53) % 1800) / 1800;
            g.beginPath();
            g.ellipse(x, y, R * (0.6 + t * 1.6), R * (0.24 + t * 0.6), 0, 0, Math.PI * 2);
            g.strokeStyle = `${P.green}${Math.round((1 - t) * 170)
              .toString(16)
              .padStart(2, '0')}`;
            g.lineWidth = 1.6;
            g.stroke();
          }
        }
      }
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [rings, arcs]);

  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    Object.assign(view.current, { drag: true, spin: false, to: null, x: e.clientX, y: e.clientY });
  };
  const move = (e: React.PointerEvent) => {
    const v = view.current;
    if (!v.drag) return;
    v.lon -= ((e.clientX - v.x) * 0.35) / v.zoom;
    v.lat = Math.max(-80, Math.min(80, v.lat + ((e.clientY - v.y) * 0.35) / v.zoom));
    v.x = e.clientX;
    v.y = e.clientY;
  };
  const up = () => {
    view.current.drag = false;
  };
  const zoom = (f: number) => {
    const v = view.current;
    fly(v.lon, v.lat, Math.max(0.8, Math.min(3.5, v.zoom * f)));
  };
  const full = () => {
    const el = stage.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  if (error) return <div className="lm lm-msg">{error}</div>;
  if (!data)
    return (
      <div className="lm lm-msg">
        <span className="lm-spin" /> Loading the live map
      </div>
    );
  const maxTop = Math.max(1, ...data.top.map((t) => t.n));
  const feed = data.feed.length ? data.feed[tick % data.feed.length] : null;
  const total = Math.max(1, data.newOnline + data.returningOnline);
  return (
    <div className="lm" ref={stage} data-dark={dark ? '1' : '0'}>
      <div className="lm-stage">
        <canvas
          ref={canvas}
          className="lm-canvas"
          role="img"
          aria-label={`A globe with ${data.online} learners online and ${data.total - data.online} offline`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <div className="lm-legend">
          <span>
            <i className="lm-pin" style={{ background: GREEN }} /> Online
          </span>
          <span>
            <i className="lm-pin" style={{ background: RED }} /> Offline
          </span>
          <span>
            <i style={{ background: 'var(--lm-pay)' }} /> Payment
          </span>
        </div>
        <div className="lm-live">
          <span className="lm-dot" /> LIVE
        </div>
        {feed ? (
          <p className="lm-feed" key={feed.at + feed.text} aria-live="polite">
            {feed.text}
          </p>
        ) : null}
        <div className="lm-ctl">
          <div className="lm-zoom">
            <button type="button" aria-label="Zoom out" onClick={() => zoom(0.75)}>
              −
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => zoom(1.33)}>
              +
            </button>
          </div>
          <select value={region} onChange={(e) => pickRegion(e.target.value)} aria-label="Region">
            {Object.entries(REGIONS).map(([k, r]) => (
              <option key={k} value={k}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={showOff ? '' : 'dim'}
            aria-pressed={showOff}
            aria-label={showOff ? 'Hide offline learners' : 'Show offline learners'}
            onClick={() => setShowOff((v) => !v)}
          >
            <Icon name={showOff ? 'eye' : 'eye-off'} size={16} />
          </button>
          <button type="button" aria-label="Full screen" onClick={full}>
            <Icon name="expand" size={16} />
          </button>
        </div>
      </div>

      <aside className="lm-side" aria-label="Live numbers">
        <div className="lm-big">
          <div>
            <span>Online right now</span>
            <b style={{ color: GREEN }}>{data.online.toLocaleString()}</b>
          </div>
          <div>
            <span>Offline</span>
            <b style={{ color: RED }}>{(data.total - data.online).toLocaleString()}</b>
          </div>
          <div>
            <span>All learners</span>
            <b>{data.total.toLocaleString()}</b>
          </div>
          <div>
            <span>Paying</span>
            <b>{data.paid.toLocaleString()}</b>
          </div>
        </div>

        <h2>Top locations</h2>
        <ul className="lm-top">
          {data.top.length ? (
            data.top.map((t) => (
              <li key={`${t.country}-${t.region}-${t.name}`}>
                <div>
                  <span>{`${t.region ? t.region + ' · ' : ''}${t.name}`}</span>
                  <small>{`${t.online} online · ${t.n} total`}</small>
                </div>
                <i style={{ width: `${Math.max(4, (t.n / maxTop) * 100)}%` }}>
                  <u style={{ width: `${(t.online / t.n) * 100}%` }} />
                </i>
              </li>
            ))
          ) : (
            <li className="lm-none">No locations yet. They appear as learners open the app.</li>
          )}
        </ul>

        <h2>Online now</h2>
        <div className="lm-split">
          <div>
            <span>New (joined this week)</span>
            <i>
              <u style={{ width: `${(data.newOnline / total) * 100}%` }} />
            </i>
            <b>{data.newOnline}</b>
          </div>
          <div>
            <span>Returning</span>
            <i>
              <u style={{ width: `${(data.returningOnline / total) * 100}%` }} />
            </i>
            <b>{data.returningOnline}</b>
          </div>
        </div>

        <h2>Top plans, 30 days</h2>
        <ul className="lm-plans">
          {data.plans30d.length ? (
            data.plans30d.map((p) => (
              <li key={p.item}>
                {`${PLAN_NAME[p.item] ?? p.item}`}
                <b>{p.n}</b>
              </li>
            ))
          ) : (
            <li className="lm-none">No payments yet.</li>
          )}
        </ul>
        <p className="lm-note">
          Dots are approximate and never show a name or email. Offline means no activity for 3 minutes.
        </p>
      </aside>
    </div>
  );
}
