'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { useStart } from '@/hooks/useStart';

const T = ({
  x,
  y,
  children,
  c = 'qt',
  a = 'middle',
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
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 240 150" className="qv" role="img" aria-hidden="true">
    {children}
  </svg>
);

function QsArt({ i }: { i: number }) {
  if (i === 0)
    return (
      <Svg>
        <g className="bob">
          <rect x={86} y={14} width={68} height={84} rx={8} className="pg" />
          {[0, 1, 2, 3, 4].map((k) => (
            <rect
              key={k}
              x={98}
              y={30 + k * 12}
              width={k === 0 ? 30 : 44 - (k % 2) * 10}
              height={5}
              rx={2.5}
              className={k === 0 ? 'ln hd' : 'ln'}
            />
          ))}
        </g>
        <path d="M120 104 v14 m-8 -8 l8 8 l8 -8" className="arw" />
        <rect x={66} y={124} width={108} height={14} rx={7} className="tray" />
        <T x={120} y={134.5} c="qm">
          syllabus.pdf
        </T>
      </Svg>
    );
  if (i === 1)
    return (
      <Svg>
        <path d="M62 40 L120 40 L178 40 M120 40 L120 100 M62 40 L62 100" className="ed" />
        {(
          [
            [62, 40, '1', 'ok'],
            [120, 40, '2', 'ok'],
            [178, 40, '3', ''],
            [62, 100, '1', 'ok'],
            [120, 100, '2', 'now'],
          ] as const
        ).map(([x, y, n, c], k) => (
          <g key={k}>
            <circle cx={x} cy={y} r={17} className={`nd ${c}`} />
            <T x={x} y={y + 5} c="qn">
              {n}
            </T>
          </g>
        ))}
        <path d="M137 100 H178" className="ed inf" />
        <circle cx={178} cy={100} r={17} className="nd gs" />
        <T x={178} y={105} c="qn">
          ?
        </T>
        <T x={120} y={140} c="qm">
          start at 1
        </T>
      </Svg>
    );
  if (i === 2)
    return (
      <Svg>
        <rect x={28} y={14} width={184} height={92} rx={10} className="bd" />
        <T x={78} y={62} c="qb">
          F = ma
        </T>
        <rect x={46} y={76} width={44} height={14} rx={4} className="cart" />
        <path d="M96 83 h40 m-7 -6 l7 6 l-7 6" className="arw g" />
        <circle cx={176} cy={44} r={10} className="pp" />
        <rect x={164} y={58} width={24} height={34} rx={10} className="pp" />
        <circle cx={120} cy={128} r={14} className="play" />
        <path d="M116 121 l11 7 l-11 7 z" className="tri" />
      </Svg>
    );
  return (
    <Svg>
      {(
        [
          ['Force', 82, 'hi'],
          ['Friction', 56, 'mid'],
          ['Newton 2', 38, 'lo'],
        ] as const
      ).map(([t, w, c], k) => (
        <g key={t} transform={`translate(34,${22 + k * 34})`}>
          <T x={0} y={-6} c="ql" a="start">
            {t}
          </T>
          <rect width={172} height={10} rx={5} className="trk" />
          <rect width={w * 1.72} height={10} rx={5} className={`fl ${c}`} />
        </g>
      ))}
      <g transform="translate(206,124)">
        <circle r={14} className="ok2" />
        <path d="M-6 0 l4 4 l8 -9" className="tk" />
      </g>
      <T x={34} y={134} c="qm" a="start">
        review: Newton 2
      </T>
    </Svg>
  );
}

const STEPS: [string, 'You' | 'We'][] = [
  ['Add your syllabus', 'You'],
  ['See the order', 'We'],
  ['Learn in 3D', 'You'],
  ['Track progress', 'We'],
];

export function QuickSteps() {
  const start = useStart();
  return (
    <section className="qs" id="quick" aria-labelledby="qs-h">
      <div className="wrap">
        <div className="qs-head">
          <span className="label">How it works</span>
          <h2 className="h1" id="qs-h">
            Four steps.
          </h2>
          <p className="lead">Your course outline in. A clear study path out.</p>
        </div>
        <ol className="qs-grid">
          {STEPS.map(([title, who], i) => (
            <li className="qs-card" key={title}>
              <div className="qs-art">
                <QsArt i={i} />
              </div>
              <div className="qs-foot">
                <span className="qs-n">{i + 1}</span>
                <h3>{title}</h3>
                <span className={clsx('qs-who', who === 'We' && 'we')}>{who} do</span>
              </div>
            </li>
          ))}
        </ol>
        <div className="qs-cta">
          <button className="btn solid lg" type="button" onClick={() => start('/app')}>
            Get started free <Icon name="chev-r" size={14} />
          </button>
          <span className="small">No account needed.</span>
        </div>
      </div>
    </section>
  );
}
