'use client';

import { useRef, useState, type PointerEvent } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/controls';
import { Halftone } from '@/components/fx/Halftone';
import { paintClassroom, paintDocument, paintGraph } from '@/lib/fx/painters';
import type { Painter } from '@/lib/fx/halftone';
import { useApp } from '@/lib/store';

type Mode = 'classroom' | 'document' | 'graph';
const PAINTERS: Record<Mode, Painter> = {
  classroom: paintClassroom,
  document: paintDocument,
  graph: paintGraph,
};
const COPY: Record<Mode, [string, string]> = {
  classroom: ['Learn in a 3D classroom', 'A live screen and boards.'],
  document: ['Your syllabus, sorted', 'Headings become topics.'],
  graph: ['What comes first', 'Topics linked in order.'],
};

const NET_P: [number, number][] = [
  [1010, 120],
  [1190, 210],
  [1330, 90],
  [1120, 340],
  [1290, 420],
  [930, 470],
  [1380, 300],
  [820, 230],
];
const NET_E: [number, number][] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [3, 4],
  [3, 5],
  [0, 7],
  [1, 6],
  [6, 4],
  [7, 5],
];

function HeroNet() {
  return (
    <svg className="hb-net" viewBox="0 0 1440 800" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
      {NET_E.map(([a, b], i) => (
        <line key={i} x1={NET_P[a][0]} y1={NET_P[a][1]} x2={NET_P[b][0]} y2={NET_P[b][1]} />
      ))}
      {NET_P.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 ? 5 : 9} className={i % 3 ? '' : 'big'} />
      ))}
    </svg>
  );
}

export function Hero() {
  const [mode, setMode] = useState<Mode>('classroom');
  const signedIn = useApp((s) => !!s.session);
  const ref = useRef<HTMLElement>(null);
  const paint: Painter = (c, w, h, t) => PAINTERS[mode](c, w, h, t);
  const [title, sub] = COPY[mode];

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <section className="hero" aria-labelledby="hero-h" ref={ref} onPointerMove={onMove}>
      <div className="hero-bg">
        <div className="swoosh a" />
        <div className="swoosh b" />
        <div className="glow" />
        <div className="hb-floor" />
        <HeroNet />
        <div className="grain" />
      </div>
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <span className="label">Syllabus in. Lessons out.</span>
          <h1 className="display" id="hero-h">
            Turn your course outline into lessons you can follow.
          </h1>
          <p className="lead">
            Upload your syllabus. See what to learn first. Learn each topic in a 3D classroom.
          </p>
          <div className="hero-cta">
            <Link className="btn solid lg" href={signedIn ? '/app/upload' : '/register'}>
              Upload a syllabus <Icon name="arrow-r" size={16} />
            </Link>
            <Link className="btn lg" href="/demo">
              See how it works
            </Link>
          </div>
          <div className="cmdpill">
            <b>●</b>
            <span>Your syllabus → a topic map → a lesson room for each topic</span>
          </div>
          <div className="hero-live label">
            Free to start <b>Works on phone, tablet and desktop</b>
          </div>
        </div>
        <div className="widget">
          <div className="widget-top">
            <Segmented
              className="mono"
              ariaLabel="Preview"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'classroom', label: 'Classroom' },
                { value: 'document', label: 'Your syllabus' },
                { value: 'graph', label: 'Topic map' },
              ]}
            />
            <span className="label">Live preview</span>
          </div>
          <div className="widget-canvas">
            <Halftone
              key={mode}
              paint={paint}
              label="Halftone preview of the product"
              options={{
                pitch: 6,
                animate: true,
                frameMs: 90,
                fadeX: 0.1,
                fadeBottom: 0.08,
                srcW: 480,
                srcH: 300,
              }}
            />
          </div>
          <div className="widget-foot">
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{title}</div>
              <div className="small" style={{ marginTop: 2, maxWidth: '36ch' }}>
                {sub}
              </div>
            </div>
            <Link className="btn sm" href="/demo">
              See it <Icon name="chev-r" size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
