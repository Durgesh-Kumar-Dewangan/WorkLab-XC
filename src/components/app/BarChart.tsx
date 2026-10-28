import type { DayMinutes } from '@/lib/domain/stats';

/** Hand-drawn SVG bars on a single axis with labelled ticks and a goal line. */
export function BarChart({
  days,
  goal,
  label = 'Minutes studied per day',
}: {
  days: DayMinutes[];
  goal: number;
  label?: string;
}) {
  const W = 560,
    H = 190,
    L = 30,
    B = 24,
    T = 10,
    R = 6;
  const max = Math.max(goal * 1.25, ...days.map((d) => d.min), 10);
  const nice = Math.ceil(max / 10) * 10;
  const bw = (W - L - R) / days.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);
  const gy = y(goal);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[0, nice / 2, nice].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={L - 6} y={y(v) + 3} textAnchor="end">
            {Math.round(v)}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = L + i * bw + bw * 0.18;
        const w = bw * 0.64;
        const top = y(d.min);
        return (
          <g key={d.key}>
            <rect
              className="brise"
              style={{ '--i': i } as React.CSSProperties}
              x={x}
              y={top}
              width={w}
              height={Math.max(0, y(0) - top)}
              rx={3}
              fill={d.min >= goal ? 'var(--green)' : 'var(--blue)'}
              opacity={d.min ? 1 : 0.15}
            >
              <title>{`${d.d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${Math.round(d.min)} min`}</title>
            </rect>
            {days.length <= 14 || i % 2 === 0 ? (
              <text x={x + w / 2} y={H - 6} textAnchor="middle">
                {days.length <= 7
                  ? d.d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3).toUpperCase()
                  : String(d.d.getDate())}
              </text>
            ) : null}
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={gy} y2={gy} stroke="var(--amber)" strokeDasharray="4 4" strokeWidth={1.2} />
      <text
        x={W - R}
        y={gy - 5}
        textAnchor="end"
        style={{ fill: 'var(--amber)' }}
      >{`DAILY GOAL ${goal} MIN`}</text>
    </svg>
  );
}
