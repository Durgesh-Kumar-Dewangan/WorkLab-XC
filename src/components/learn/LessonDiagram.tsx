'use client';

import type { Diagram } from '@/lib/learn';

/** Wraps a label onto at most two short lines for the SVG diagrams. */
function lines(label: string, max = 14): string[] {
  const words = label.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, 2).map((l, i) => (i === 1 && out.length > 2 ? l + '…' : l));
}

function Cycle({ d }: { d: Extract<Diagram, { kind: 'cycle' }> }) {
  const n = d.steps.length;
  const R = 92;
  const cx = 150;
  const cy = 120;
  const pts = d.steps.map((_, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  return (
    <svg className="dg-svg" viewBox="0 0 300 240" role="img" aria-label={d.title}>
      <defs>
        <marker
          id="dg-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill="var(--blue)" />
        </marker>
      </defs>
      {pts.map((p, i) => {
        const q = pts[(i + 1) % n];
        const mx = (p.x + q.x) / 2 + (cx - (p.x + q.x) / 2) * -0.0;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const pad = 26;
        return (
          <line
            key={i}
            x1={p.x + (dx / len) * pad}
            y1={p.y + (dy / len) * pad}
            x2={q.x - (dx / len) * pad}
            y2={q.y - (dy / len) * pad}
            stroke="var(--blue)"
            strokeWidth="1.6"
            markerEnd="url(#dg-arrow)"
            data-m={mx}
          />
        );
      })}
      {pts.map((p, i) => {
        const ls = lines(d.steps[i].label);
        return (
          <g key={i}>
            <rect
              x={p.x - 40}
              y={p.y - 17}
              width="80"
              height="34"
              rx="10"
              fill="var(--panel2)"
              stroke="var(--line2)"
            />
            {ls.map((l, k) => (
              <text
                key={k}
                x={p.x}
                y={p.y + (ls.length === 1 ? 4 : k * 12 - 2)}
                textAnchor="middle"
                fontSize="10.5"
                fill="var(--fg)"
              >
                {l}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function Plot({ d }: { d: Extract<Diagram, { kind: 'plot' }> }) {
  const W = 320;
  const H = 210;
  const L = 44;
  const B = 36;
  const T = 14;
  const Rr = 14;
  const xs = d.points.map((p) => p[0]);
  const ys = d.points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(...ys);
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - Rr);
  const sy = (y: number) => H - B - ((y - y0) / (y1 - y0 || 1)) * (H - B - T);
  const path = d.points
    .map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`)
    .join(' ');
  const ticks = (a: number, b: number) => [a, (a + b) / 2, b].map((v) => Math.round(v * 100) / 100);
  return (
    <svg
      className="dg-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${d.title}. ${d.yLabel || 'y'} against ${d.xLabel || 'x'}.`}
    >
      <line x1={L} y1={H - B} x2={W - Rr} y2={H - B} stroke="var(--fg3)" />
      <line x1={L} y1={T} x2={L} y2={H - B} stroke="var(--fg3)" />
      {ticks(x0, x1).map((v) => (
        <text key={`x${v}`} x={sx(v)} y={H - B + 14} textAnchor="middle" fontSize="10" fill="var(--fg3)">
          {v}
        </text>
      ))}
      {ticks(y0, y1).map((v) => (
        <text key={`y${v}`} x={L - 6} y={sy(v) + 3} textAnchor="end" fontSize="10" fill="var(--fg3)">
          {v}
        </text>
      ))}
      <path d={path} fill="none" stroke="var(--blue)" strokeWidth="2.2" strokeLinejoin="round" />
      {d.points.map((p, i) => (
        <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r="3.2" fill="var(--blue)" />
      ))}
      <text x={(L + W - Rr) / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--fg2)">
        {d.xLabel}
      </text>
      <text
        transform={`translate(12 ${(T + H - B) / 2}) rotate(-90)`}
        textAnchor="middle"
        fontSize="11"
        fill="var(--fg2)"
      >
        {d.yLabel}
      </text>
    </svg>
  );
}

/** A diagram the lesson describes in plain data, drawn here on the page's own colours so it is sharp on every screen and in every theme. */
export function LessonDiagram({ d }: { d: Diagram }) {
  return (
    <figure className="dg">
      <figcaption>{d.title}</figcaption>
      {d.kind === 'flow' ? (
        <ol className="dg-flow">
          {d.steps.map((s, i) => (
            <li key={i}>
              <b>{s.label}</b>
              {s.note ? <span>{s.note}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {d.kind === 'cycle' ? <Cycle d={d} /> : null}
      {d.kind === 'tiers' ? (
        <div className="dg-tiers">
          {d.tiers.map((row, i) => (
            <div key={i} className="dg-tier">
              {row.map((l, k) => (
                <span key={k}>{l}</span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {d.kind === 'compare' ? (
        <div
          className="dg-cmp"
          style={{ gridTemplateColumns: `repeat(${d.columns.length}, minmax(0, 1fr))` }}
        >
          {d.columns.map((c, i) => (
            <div key={i}>
              <b>{c.title}</b>
              <ul>
                {c.points.map((p, k) => (
                  <li key={k}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {d.kind === 'plot' ? <Plot d={d} /> : null}
    </figure>
  );
}
