'use client';

import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useStart } from '@/hooks/useStart';

const T = ({
  x,
  y,
  children,
  c = '',
  a = 'start',
}: {
  x: number;
  y: number;
  children: ReactNode;
  c?: string;
  a?: 'start' | 'middle' | 'end';
}) => (
  <text x={x} y={y} className={c} textAnchor={a}>
    {children}
  </text>
);

function UcArt({ kind }: { kind: 'student' | 'teacher' | 'self' }) {
  if (kind === 'student') {
    const pts: [number, number][] = [
      [48, 168],
      [128, 112],
      [214, 150],
      [300, 84],
      [378, 132],
    ];
    const names = ['Velocity', 'Force', 'Acceleration', 'Newton 2', 'Work'];
    return (
      <svg
        viewBox="0 0 420 240"
        className="ucs"
        role="img"
        aria-label="A study path through five topics, three done, one next"
      >
        <polyline points={pts.map((p) => p.join(',')).join(' ')} className="path rest" />
        <polyline
          points={pts
            .slice(0, 4)
            .map((p) => p.join(','))
            .join(' ')}
          className="path done"
        />
        {pts.map((p, i) => (
          <g key={i} transform={`translate(${p[0]},${p[1]})`}>
            {i === 3 ? <circle r={22} className="pulse" /> : null}
            <circle r={13} className={i < 3 ? 'nd done' : i === 3 ? 'nd next' : 'nd rest'} />
            {i < 3 ? <path d="M-5 0 L-1.5 4 L5.5 -4" className="tick" /> : null}
            <T x={0} y={32} c="lb" a="middle">
              {names[i]}
            </T>
          </g>
        ))}
        <T x={300} y={40} c="tag" a="middle">
          Start here
        </T>
        <g transform="translate(20,16)">
          <rect width={120} height={26} rx={13} className="pill" />
          <T x={60} y={17.5} c="mono" a="middle">
            3 of 5 · 62%
          </T>
        </g>
      </svg>
    );
  }
  if (kind === 'teacher') {
    return (
      <svg
        viewBox="0 0 420 240"
        className="ucs"
        role="img"
        aria-label="A lesson board with a link back to the page it came from"
      >
        <rect x={24} y={22} width={262} height={160} rx={12} className="board" />
        <T x={42} y={50} c="lb w">
          Newton’s second law
        </T>
        <T x={42} y={108} c="big">
          F = ma
        </T>
        <line x1={42} y1={124} x2={150} y2={124} className="ul" />
        <rect x={42} y={142} width={74} height={22} rx={5} className="cart" />
        <circle cx={56} cy={168} r={7} className="wh" />
        <circle cx={102} cy={168} r={7} className="wh" />
        <line x1={124} y1={153} x2={190} y2={153} className="vec" />
        <path d="M190 147 L202 153 L190 159 z" className="vech" />
        <path d="M286 120 C330 120 320 170 340 170" className="link" />
        <circle cx={286} cy={120} r={4} className="dot" />
        <g transform="translate(250,150)">
          <rect width={150} height={66} rx={10} className="src" />
          <T x={14} y={26} c="mono w">
            physics-101.pdf
          </T>
          <T x={14} y={48} c="mono hi">
            p.4 · §2.3
          </T>
        </g>
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={40 + i * 22} cy={214} r={7} className={i === 2 ? 'st hand' : 'st'} />
        ))}
        <T x={140} y={218} c="mono dim">
          a question from row 3
        </T>
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 420 240"
      className="ucs"
      role="img"
      aria-label="A pasted outline becomes an ordered reading plan with one gap flagged"
    >
      <g transform="translate(22,24)">
        <rect width={150} height={190} rx={12} className="board" />
        <T x={14} y={24} c="mono dim">
          Pasted outline
        </T>
        {['Regression', 'Probability', 'Sampling', 'Distributions', 'Hypothesis tests'].map((s, i) => (
          <T key={s} x={14} y={54 + i * 28} c="lb w">
            {s}
          </T>
        ))}
      </g>
      <path d="M184 120 H214" className="ar" />
      <path d="M208 112 L218 120 L208 128" className="ar2" />
      {[
        ['1', 'Probability'],
        ['2', 'Distributions'],
        ['3', 'Sampling'],
        ['4', 'Hypothesis tests'],
      ].map((o, i) => (
        <g key={o[0]} transform={`translate(228,${28 + i * 40})`}>
          <rect width={170} height={32} rx={16} className="chipo" />
          <circle cx={16} cy={16} r={10} className="num" />
          <T x={16} y={20} c="mono nn" a="middle">
            {o[0]}
          </T>
          <T x={36} y={20.5} c="lb w">
            {o[1]}
          </T>
        </g>
      ))}
      <g transform="translate(228,190)">
        <rect width={170} height={32} rx={16} className="chipo gap" />
        <T x={85} y={20.5} c="mono am" a="middle">
          + Variance? inferred gap
        </T>
      </g>
    </svg>
  );
}

const CASES: {
  kind: 'student' | 'teacher' | 'self';
  who: string;
  head: string;
  body: string;
  bullets: string[];
}[] = [
  {
    kind: 'student',
    who: 'Students',
    head: 'Turn a course outline into a study path.',
    body: 'See the order. Start at the weak spot.',
    bullets: ['Prerequisite map', 'Mastery per topic', 'Revision suggestions'],
  },
  {
    kind: 'teacher',
    who: 'Teachers',
    head: 'Show the structure before you teach it.',
    body: 'Show the topics. Open a 3D lesson.',
    bullets: ['Source-traced topics', 'Editable course tree', 'Lesson timeline'],
  },
  {
    kind: 'self',
    who: 'Self-learners',
    head: 'Make a reading list behave like a course.',
    body: 'Paste chapter titles. Get an order.',
    bullets: ['Paste any outline', 'Practice sets', 'AI tutor'],
  },
];

export function UseCases() {
  const start = useStart();
  return (
    <section className="uc-sec" id="usecases" aria-labelledby="uc-h">
      <div className="wrap">
        <span className="label">Use cases</span>
        <h2 className="h1" id="uc-h" style={{ maxWidth: '18ch', marginTop: 12 }}>
          One syllabus, three ways to use it.
        </h2>
        <div className="uc-grid">
          {CASES.map((c) => (
            <article className="uc" key={c.kind}>
              <div className="uc-art">
                <UcArt kind={c.kind} />
              </div>
              <div className="uc-b">
                <span className="label">For {c.who.toLowerCase()}</span>
                <h3>{c.head}</h3>
                <p>{c.body}</p>
                <ul>
                  {c.bullets.map((b) => (
                    <li key={b}>
                      <Icon name="check" size={14} />
                      {b}
                    </li>
                  ))}
                </ul>
                <button className="btn sm" type="button" onClick={() => start('/app')}>
                  Get started <Icon name="chev-r" size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
