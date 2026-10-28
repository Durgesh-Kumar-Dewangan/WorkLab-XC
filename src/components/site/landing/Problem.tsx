'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { useStart, useGoSection } from '@/hooks/useStart';
import { useScrollFrame } from '@/hooks/useScrollFrame';
import { useTween } from '@/hooks/useTween';
import { clamp, lerp, prefersReducedMotion, seeded } from '@/lib/util';

/* ---------------- scene visuals ---------------- */

const Top = ({ left, bad, good }: { left: string; bad: string; good: string }) => (
  <div className="vp-top">
    <span className="mono">{left}</span>
    <span className="st-sw">
      <span className="chipx bad">{bad}</span>
      <span className="chipx good">{good}</span>
    </span>
  </div>
);

function VisWall() {
  const widths = useMemo(() => {
    const rnd = seeded(8);
    const hs = [0, 7, 14];
    const ts = [1, 2, 8, 9, 15, 16];
    return Array.from({ length: 22 }, (_, i) => ({
      cls: hs.includes(i) ? ' h' : ts.includes(i) ? ' t' : '',
      w: (hs.includes(i) ? 54 : ts.includes(i) ? 70 : 62 + rnd() * 34).toFixed(2),
    }));
  }, []);
  const lines = widths.map((l, i) => <i key={i} className={`ln${l.cls}`} style={{ width: `${l.w}%` }} />);
  const rows: [string, string][] = [
    ['Unit 1 · Motion', 'p.2'],
    ['Velocity', 'p.2'],
    ['Acceleration', 'p.3'],
    ['Unit 2 · Newtonian mechanics', 'p.3'],
    ['Newton’s second law', 'p.4'],
    ['Friction', 'p.5'],
  ];
  return (
    <div className="vp wall">
      <Top left="physics-101.pdf · 47 pages" bad="No structure" good="17 topics found" />
      <div className="wall-b">
        <div className="pg">{lines}</div>
        <div className="pg p2">{lines}</div>
        <div className="ex">
          <span className="label">Course tree</span>
          {rows.map(([t, p], i) => (
            <div key={t} className={clsx('exr', i % 3 === 0 && 'u')}>
              <span>{t}</span>
              <b>{p}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const W = 116;
const H = 32;
type OrdNode = [label: string, from: [number, number], to: [number, number], badge: number, cls: string];
const ORD: Record<string, OrdNode> = {
  vel: ['Velocity', [380, 196], [6, 40], 1, 'ok'],
  frc: ['Force', [34, 70], [6, 200], 1, 'weak'],
  acc: ['Acceleration', [220, 24], [166, 40], 2, 'ok'],
  n2: ['Newton’s 2nd law', [124, 222], [326, 120], 3, 'now'],
  fri: ['Friction', [430, 64], [478, 40], 4, ''],
  wrk: ['Work', [270, 126], [478, 200], 4, ''],
};
const ORD_E: [string, string, boolean?][] = [
  ['vel', 'acc'],
  ['acc', 'n2'],
  ['frc', 'n2'],
  ['n2', 'fri'],
  ['n2', 'wrk', true],
];

function VisOrder({ solved }: { solved: boolean }) {
  const u = useTween(solved ? 1 : 0, 750);
  const ctr = (id: string): [number, number] => {
    const n = ORD[id];
    const [, from, to] = n;
    return [lerp(from[0], to[0], u) + W / 2, lerp(from[1], to[1], u) + H / 2];
  };
  return (
    <div className="vp">
      <Top left="Topics from the syllabus" bad="No order" good="Learning path" />
      <svg
        viewBox="0 0 600 270"
        className={clsx('ord', solved && 'solved')}
        role="img"
        aria-label="Topics scattered with tangled links, then ordered into a learning path"
      >
        <defs>
          <marker
            id="ord-a"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0 L10 5 L0 10 z" className="mg-ah" />
          </marker>
        </defs>
        {ORD_E.map(([a, b, inf], i) => {
          const [x1, y1] = ctr(a);
          const [x2, y2] = ctr(b);
          const dx = x2 - x1,
            dy = y2 - y1;
          const d = Math.hypot(dx, dy) || 1;
          const ux = dx / d,
            uy = dy / d;
          const s = Math.min(
            Math.abs(ux) > 1e-3 ? (W / 2 + 3) / Math.abs(ux) : 1e9,
            Math.abs(uy) > 1e-3 ? (H / 2 + 3) / Math.abs(uy) : 1e9,
          );
          return (
            <line
              key={i}
              className={clsx('ol', inf && 'inf')}
              markerEnd="url(#ord-a)"
              x1={x1 + ux * s}
              y1={y1 + uy * s}
              x2={x2 - ux * s}
              y2={y2 - uy * s}
            />
          );
        })}
        {Object.entries(ORD).map(([k, n]) => (
          <g
            key={k}
            className={`on ${n[4]}`}
            transform={`translate(${lerp(n[1][0], n[2][0], u).toFixed(1)},${lerp(n[1][1], n[2][1], u).toFixed(1)})`}
          >
            <rect width={W} height={H} rx={16} />
            <text x={W / 2} y={H / 2 + 4.5} textAnchor="middle">
              {n[0]}
            </text>
            <g className="bd" transform="translate(8,2)">
              <circle cx={0} cy={0} r={9} />
              <text x={0} y={4} textAnchor="middle">
                {String(n[3])}
              </text>
            </g>
          </g>
        ))}
        <text x={300} y={20} className="q" textAnchor="middle">
          Where do I start?
        </text>
        <text x={64} y={24} className="tag st" textAnchor="middle">
          Start here
        </text>
      </svg>
    </div>
  );
}

function VisPractice() {
  const opt = (l: string, t: string, cls?: string) => (
    <div className={clsx('qo', cls)}>
      <b>{l}</b>
      <span>{t}</span>
    </div>
  );
  return (
    <div className="vp">
      <Top left="Question 2 of 5" bad="No explanation" good="Traced to source" />
      <div className="qz">
        <p className="qq">A 2 kg cart accelerates at 3 m/s². What net force acts on it?</p>
        <div className="opts">
          {opt('A', '3 N', 'is-wrong')}
          {opt('B', '6 N', 'is-right')}
          {opt('C', '9 N')}
        </div>
        <div className="fb-sw">
          <div className="fb bad">
            <Icon name="x" size={15} />
            <span>Incorrect. Try again.</span>
          </div>
          <div className="fb good">
            <div className="fb-t">
              <Icon name="check" size={15} />
              <span>F = ma, so F = 2 × 3 = 6 N. The 3 is the acceleration, not the force.</span>
            </div>
            <div className="fb-r">
              <span className="srcchip mono">physics-101.pdf · p.4 · §2.3</span>
              <span className="lnk">
                Revisit at 00:24 <Icon name="chev-r" size={13} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisProgress() {
  const rows: [string, number, string][] = [
    ['Velocity', 88, 'Strong · 7 of 8 correct'],
    ['Force and free-body diagrams', 62, 'Mixed · missed 2 on direction'],
    ['Newton’s second law', 41, 'Weak · prerequisite at 62%'],
    ['Friction', 55, 'Few attempts · 3 so far'],
  ];
  return (
    <div className="vp">
      <Top left="Unit 2 · progress" bad="Just a grade" good="Progress with reasons" />
      <div className="pr-sw">
        <div className="pr bad">
          <b className="grade">B−</b>
          <span>Overall</span>
          <i className="blurred" />
          <i className="blurred s" />
          <p>Why? What next? Nothing here says.</p>
        </div>
        <div className="pr good">
          {rows.map((r) => (
            <div className="prr" key={r[0]}>
              <div className="prh">
                <span>{r[0]}</span>
                <b className="num">{r[1]}%</b>
              </div>
              <div className="bar">
                <i style={{ width: `${r[1]}%` }} className={r[1] < 50 ? 'lo' : r[1] < 70 ? 'mid' : 'hi'} />
              </div>
              <small>{r[2]}</small>
            </div>
          ))}
          <div className="nextst">
            <span className="label">Next step</span>
            <b>Revisit Force and free-body diagrams, then retry Newton’s second law</b>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- scrolling story ---------------- */

interface Scene {
  step: string;
  pT: string;
  pP: string;
  sT: string;
  sP: string;
  vis: (solved: boolean) => ReactNode;
}
const SCENES: Scene[] = [
  {
    step: 'Structure',
    pT: 'Your syllabus arrives as a wall of text.',
    pP: 'A wall of text. No clear topics.',
    sT: 'We sort it into topics.',
    sP: 'Every topic keeps its page number.',
    vis: () => <VisWall />,
  },
  {
    step: 'Order',
    pT: 'Nobody tells you what to learn first.',
    pP: 'No one says what to learn first.',
    sT: 'We show the order.',
    sP: 'Start at 1. Guesses are marked.',
    vis: (s) => <VisOrder solved={s} />,
  },
  {
    step: 'Source',
    pT: 'Practice that never points back.',
    pP: 'A wrong answer just says “incorrect”.',
    sT: 'Every answer is explained.',
    sP: 'With a link to the page it came from.',
    vis: () => <VisPractice />,
  },
  {
    step: 'Mastery',
    pT: 'Your progress is just a number.',
    pP: 'A grade, with no reason.',
    sT: 'See how well you know each topic.',
    sP: 'And what to review next.',
    vis: () => <VisProgress />,
  },
];
const N = SCENES.length;

export function Problem() {
  const start = useStart();
  const go = useGoSection();
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const [pos, setPos] = useState({ idx: 0, solved: false });

  useScrollFrame(() => {
    const t = track.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const span = Math.max(1, t.offsetHeight - window.innerHeight);
    const p = clamp(-r.top / span, 0, 0.9999);
    const f = p * N;
    const idx = Math.floor(f);
    const solved = f - idx > 0.46;
    if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`;
    setPos((o) => (o.idx === idx && o.solved === solved ? o : { idx, solved }));
  }, track);

  const jump = (i: number) => {
    const t = track.current;
    if (!t) return;
    const top = t.getBoundingClientRect().top + window.scrollY;
    const span = t.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: top + span * ((i + 0.62) / N),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const isSolved = (i: number) => (i === pos.idx ? pos.solved : i < pos.idx);

  return (
    <section className="story" id="problem" aria-labelledby="story-h">
      <div className="wrap">
        <div className="story-head">
          <span className="label">The problem</span>
          <h2 className="h1" id="story-h">
            Studying from a syllabus is guesswork.
          </h2>
          <p className="lead">Four problems. Keep scrolling to see each fix.</p>
        </div>
      </div>
      <div className="story-track" ref={track} style={{ height: `${N * 125}vh` }}>
        <div className="story-pin">
          <div className="wrap sp-in">
            <div className="sp-left">
              <div className="sp-stack">
                {SCENES.map((s, i) => (
                  <div
                    key={s.step}
                    className={clsx('scene sc-copy', i === pos.idx && 'on', isSolved(i) && 'solved')}
                  >
                    <div className="sc-badge">
                      <span className="bp">
                        <i />
                        Problem {i + 1} of {N}
                      </span>
                      <span className="bs">
                        <i />
                        With WorkLab XC
                      </span>
                    </div>
                    <div className="sc-txt">
                      <div className="pb">
                        <h3>{s.pT}</h3>
                        <p>{s.pP}</p>
                      </div>
                      <div className="sb">
                        <h3>{s.sT}</h3>
                        <p>{s.sP}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <ol className="sp-steps" aria-label="Problems">
                {SCENES.map((s, i) => (
                  <li key={s.step} className={clsx(i === pos.idx && 'cur')}>
                    <button type="button" onClick={() => jump(i)}>
                      <span className="mono">0{i + 1}</span>
                      <b>{s.step}</b>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="sp-rail" aria-hidden="true">
                <i className="sp-bar" ref={bar} />
              </div>
            </div>
            <div className="sp-stack">
              {SCENES.map((s, i) => (
                <div
                  key={s.step}
                  className={clsx('scene sc-vis', i === pos.idx && 'on', isSolved(i) && 'solved')}
                >
                  {s.vis(isSolved(i))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="wrap">
        <div className="story-end">
          <h3 className="h2">One connected record, from the first page to the last answer.</h3>
          <div className="row wrap-r" style={{ gap: 10 }}>
            <button className="btn solid lg" type="button" onClick={() => start('/app')}>
              Get started <Icon name="chev-r" size={14} />
            </button>
            <button className="btn lg" type="button" onClick={() => go('how')}>
              See how it works
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
