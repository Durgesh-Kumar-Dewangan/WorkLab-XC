'use client';

import { useState } from 'react';
import { curriculumLabel } from '@/lib/curricula';

export const hm = (m: number) => {
  const t = Math.round(m || 0);
  return t >= 60 ? `${Math.floor(t / 60)}h ${String(t % 60).padStart(2, '0')}m` : `${t}m`;
};
export const when = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'never';
export const day = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'never';
export const money = (m: number, c: string) =>
  c === 'USD' ? `$${(m / 100).toFixed(2)}` : `₹${Math.round(m / 100).toLocaleString('en-IN')}`;
/** Readable names for any curriculum value; unknown ones are tidied rather than shown raw. */
export const SYLLABUS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, k) => (typeof k === 'string' ? curriculumLabel(k) : ''),
});

export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className={`ad-kpi ${tone ?? ''}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

/** A horizontal bar per row, scaled to the biggest. */
export function Bars({ rows, unit = '' }: { rows: { name: string; n: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className="small">Nothing yet.</p>;
  return (
    <ul className="ad-bars">
      {rows.map((r) => (
        <li key={r.name}>
          <span>{r.name}</span>
          <i>
            <u style={{ width: `${Math.max(2, (r.n / max) * 100)}%` }} />
          </i>
          <b>{`${r.n.toLocaleString()}${unit}`}</b>
        </li>
      ))}
    </ul>
  );
}

type Pt = { label: string; a: number; b?: number };
type View = 'bars' | 'line' | 'area' | 'total' | 'table';
const VIEWS: [View, string][] = [
  ['bars', 'Bars'],
  ['line', 'Line'],
  ['area', 'Area'],
  ['total', 'Running total'],
  ['table', 'Table'],
];
const RANGES: [number, string][] = [
  [7, '7 days'],
  [14, '14 days'],
  [30, '30 days'],
  [0, 'All'],
];

/** Joins days into weeks (Monday start) so a long period is easy to read. */
function byWeek(s: Pt[]): Pt[] {
  const out = new Map<string, Pt>();
  for (const p of s) {
    const d = new Date(`${p.label}T00:00:00`);
    if (Number.isNaN(d.getTime())) return s;
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = d.toISOString().slice(0, 10);
    const w = out.get(k) ?? { label: `wk ${k.slice(5)}`, a: 0, b: p.b === undefined ? undefined : 0 };
    w.a += p.a;
    if (p.b !== undefined) w.b = (w.b ?? 0) + p.b;
    out.set(k, w);
  }
  return [...out.values()];
}

/** A short series (minutes a day, made against reused a day) with views to switch between: bars, line, area, running total and a table. */
export function Columns({ series, labels }: { series: Pt[]; labels?: [string, string?] }) {
  const [view, setView] = useState<View>('bars');
  const [range, setRange] = useState(0);
  const [weekly, setWeekly] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  if (!series.length) return <p className="small">No data yet.</p>;

  const raw = range ? series.slice(-range) : series;
  let pts = weekly ? byWeek(raw) : raw;
  if (view === 'total') {
    let ta = 0;
    let tb = 0;
    pts = pts.map((p) => {
      ta += p.a;
      tb += p.b ?? 0;
      return { label: p.label, a: ta, b: p.b === undefined ? undefined : tb };
    });
  }
  const two = pts.some((p) => p.b !== undefined);
  const max = Math.max(1, ...pts.map((p) => Math.max(p.a, p.b ?? 0)));
  const stackMax = Math.max(1, ...pts.map((p) => p.a + (p.b ?? 0)));
  const sumA = raw.reduce((t, p) => t + p.a, 0);
  const sumB = raw.reduce((t, p) => t + (p.b ?? 0), 0);
  const peak = raw.reduce((m, p) => (p.a + (p.b ?? 0) > m.a + (m.b ?? 0) ? p : m), raw[0]);
  const W = 600;
  const H = 150;
  const x = (i: number) => (pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 8) - 2;
  const path = (k: 'a' | 'b') =>
    pts
      .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(k === 'a' ? p.a : (p.b ?? 0)).toFixed(1)}`)
      .join(' ');
  const area = (k: 'a' | 'b') =>
    `${path(k)} L${x(pts.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const tip = hover !== null ? pts[hover] : null;

  return (
    <div className="ad-chart">
      <div className="ad-ctl">
        <div className="ad-seg" role="group" aria-label="Chart view">
          {VIEWS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={view === v ? 'on' : ''}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {l}
            </button>
          ))}
        </div>
        {series.length > 7 ? (
          <div className="ad-seg" role="group" aria-label="Period">
            {RANGES.filter(([r]) => !r || r < series.length).map(([r, l]) => (
              <button
                key={r}
                type="button"
                className={range === r ? 'on' : ''}
                aria-pressed={range === r}
                onClick={() => setRange(r)}
              >
                {l}
              </button>
            ))}
          </div>
        ) : null}
        {series.length > 14 ? (
          <label className="small ad-check">
            <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} /> By week
          </label>
        ) : null}
      </div>
      <p className="ad-sum small">
        <span>
          Total <b>{sumA.toLocaleString()}</b>
          {two ? (
            <>
              {' + '}
              <b>{sumB.toLocaleString()}</b>
            </>
          ) : null}
        </span>
        <span>
          Average <b>{(sumA / raw.length).toFixed(1)}</b>
          {two ? (
            <>
              {' + '}
              <b>{(sumB / raw.length).toFixed(1)}</b>
            </>
          ) : null}{' '}
          a day
        </span>
        <span>
          Busiest <b>{peak.label}</b> ({(peak.a + (peak.b ?? 0)).toLocaleString()})
        </span>
      </p>

      {view === 'table' ? (
        <div className="tablewrap" style={{ maxHeight: 260, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                <th>{labels?.[0] ?? 'Value'}</th>
                {two ? <th>{labels?.[1] ?? 'Second'}</th> : null}
              </tr>
            </thead>
            <tbody>
              {[...pts].reverse().map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td>{p.a.toLocaleString()}</td>
                  {two ? <td>{(p.b ?? 0).toLocaleString()}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ad-plot" onMouseLeave={() => setHover(null)}>
          {view === 'bars' ? (
            <div className="ad-cols" role="img" aria-label={labels?.join(' and ') ?? 'chart'}>
              {pts.map((s, i) => (
                <span
                  key={s.label}
                  onMouseEnter={() => setHover(i)}
                  title={`${s.label}: ${s.a}${s.b !== undefined ? ` and ${s.b}` : ''}`}
                >
                  <u style={{ height: `${(s.a / stackMax) * 100}%` }} />
                  {s.b !== undefined ? <i style={{ height: `${(s.b / stackMax) * 100}%` }} /> : null}
                </span>
              ))}
            </div>
          ) : (
            <svg
              className="ad-svg"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={labels?.join(' and ') ?? 'chart'}
            >
              {[0.25, 0.5, 0.75].map((g) => (
                <line
                  key={g}
                  x1="0"
                  x2={W}
                  y1={H - g * (H - 8) - 2}
                  y2={H - g * (H - 8) - 2}
                  className="ad-grid"
                />
              ))}
              {view !== 'line' ? <path d={area('a')} className="ad-fill a" /> : null}
              {view !== 'line' && two ? <path d={area('b')} className="ad-fill b" /> : null}
              <path d={path('a')} className="ad-ln a" vectorEffect="non-scaling-stroke" />
              {two ? <path d={path('b')} className="ad-ln b" vectorEffect="non-scaling-stroke" /> : null}
              {pts.map((p, i) => (
                <rect
                  key={p.label}
                  x={x(i) - W / pts.length / 2}
                  y="0"
                  width={W / pts.length}
                  height={H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                >
                  <title>{`${p.label}: ${p.a}${p.b !== undefined ? ` and ${p.b}` : ''}`}</title>
                </rect>
              ))}
              {hover !== null ? (
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1="0"
                  y2={H}
                  className="ad-cursor"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
          )}
          <p className="ad-axis small">
            <span>{pts[0].label}</span>
            <span>
              {tip
                ? `${tip.label}: ${tip.a.toLocaleString()}${tip.b !== undefined ? ` · ${tip.b.toLocaleString()}` : ''}`
                : `top ${max.toLocaleString()}`}
            </span>
            <span>{pts[pts.length - 1].label}</span>
          </p>
        </div>
      )}
      {labels ? (
        <p className="small ad-leg">
          <u /> {labels[0]}{' '}
          {labels[1] ? (
            <>
              <i /> {labels[1]}
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
