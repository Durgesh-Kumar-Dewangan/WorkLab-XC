'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/controls';
import { Halftone } from '@/components/fx/Halftone';
import { DitherPanel } from '@/components/fx/DitherPanel';
import { paintClassroom } from '@/lib/fx/painters';
import { useStart } from '@/hooks/useStart';
import { prefersReducedMotion } from '@/lib/util';
import { MiniGraph } from './MiniGraph';

type Tab = 'syllabus' | 'graph' | 'classroom';

const LINES = [
  '2    Newtonian mechanics',
  '2.1  Newton’s first law ........ p.3',
  '2.2  Force and free-body diagrams  p.4',
  '2.3  Newton’s second law, F = ma . p.4',
  '2.4  Newton’s third law ....... p.5',
  'Outcome: apply F = ma in one dimension',
  'Assessment: weekly problem sets',
];
const OUTLINE: [string, 'Unit' | 'Topic', number, string][] = [
  ['Newtonian mechanics', 'Unit', 0, 'p.3'],
  ['Newton’s first law', 'Topic', 1, 'p.3'],
  ['Force and free-body diagrams', 'Topic', 2, 'p.4'],
  ['Newton’s second law', 'Topic', 3, 'p.4'],
];

function SyllabusPane() {
  const [hl, setHl] = useState(3);
  return (
    <>
      <div>
        <h3>What you uploaded</h3>
        <div className="doclines">
          {LINES.map((l, k) => (
            <span key={k} className={k === hl ? 'hl' : ''}>
              {l}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3>What was extracted. You review it.</h3>
        <ul className="outline">
          {OUTLINE.map((o) => (
            <li
              key={o[0]}
              className={o[1] === 'Topic' ? 'in' : ''}
              tabIndex={0}
              style={{ cursor: 'pointer', borderColor: o[2] === hl ? 'var(--blue)' : undefined }}
              onClick={() => setHl(o[2])}
              onKeyDown={(e) => e.key === 'Enter' && setHl(o[2])}
            >
              <span>{o[0]}</span>
              <span className="ref">{o[3]}</span>
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 12, fontSize: 13 }}>Select a topic to see the line it came from.</p>
      </div>
    </>
  );
}

function ClassroomPane() {
  return (
    <>
      <div>
        <h3>A screen, two boards and a 3D model</h3>
        <p>Pause or skip any time.</p>
        <div style={{ marginTop: 16 }}>
          <Link className="btn sm" href="/demo/classroom/n2">
            Open the sample classroom <Icon name="arrow-r" size={14} />
          </Link>
        </div>
      </div>
      <div className="shot">
        <Halftone
          paint={paintClassroom}
          label="Halftone classroom"
          options={{ pitch: 5, animate: true, frameMs: 100, fadeX: 0.06, srcW: 480, srcH: 300 }}
        />
      </div>
    </>
  );
}

const STEPS = [
  {
    t: 'Sorted',
    p: 'Your outline becomes topics.',
    stops: ['#07060f', '#1d1250', '#4b2fd0', '#8b6cff', '#ffb36b'],
    seed: 3,
    mock: [
      ['k', 'Syllabus'],
      ['row', 'physics-101.pdf', '84 KB'],
      ['row', 'Units found', '4'],
      ['row', 'Topics found', '17'],
      ['row', 'Uncertain', '2'],
      ['btn', 'Review structure'],
    ],
  },
  {
    t: 'Connected',
    p: 'See what comes first.',
    stops: ['#04101f', '#0a2a5a', '#1c6bff', '#6fb0ff', '#c9f0ff'],
    seed: 9,
    mock: [
      ['k', 'Newton’s second law'],
      ['row', 'requires', 'Force'],
      ['row', 'requires', 'Acceleration'],
      ['row', 'applies to', 'Friction'],
      ['row', 'inferred', 'Work'],
      ['btn', 'Accept inference'],
    ],
  },
  {
    t: 'Taught',
    p: 'Learn each topic in 3D.',
    stops: ['#0b0612', '#3a0f4f', '#a02fd0', '#ff6bd4', '#ffd1a1'],
    seed: 14,
    mock: [
      ['k', 'Lesson timeline'],
      ['row', '00:00 Force and mass', 'board'],
      ['row', '00:24 Push the cart', 'model'],
      ['row', '00:51 Check in', 'question'],
      ['row', '01:20 Worked example', 'board'],
      ['btn', 'Play lesson'],
    ],
  },
] as const;

function StepTrack() {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, x: 0, left: 0 });
  const [dragging, setDragging] = useState(false);

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || !track.current) return;
    drag.current = { on: true, x: e.clientX, left: track.current.scrollLeft };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current.on || !track.current) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 4) setDragging(true);
    track.current.scrollLeft = drag.current.left - dx;
  };
  const end = () => {
    drag.current.on = false;
    setDragging(false);
  };
  const by = (dir: number) =>
    track.current?.scrollBy({
      left: dir * Math.min(660, track.current.clientWidth * 0.86),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') by(1);
    if (e.key === 'ArrowLeft') by(-1);
  };

  return (
    <>
      <div className="wrap" id="steps" style={{ scrollMarginTop: 80 }}>
        <div className="steps-head">
          <div>
            <h2 className="h1">From outline to lesson in three steps.</h2>
            <p className="lead" style={{ marginTop: 12 }}>
              Three steps.
            </p>
          </div>
          <div className="track-nav">
            <button
              className="icon-btn bordered"
              type="button"
              aria-label="Previous step"
              onClick={() => by(-1)}
            >
              <Icon name="chev-l" size={18} />
            </button>
            <button className="icon-btn bordered" type="button" aria-label="Next step" onClick={() => by(1)}>
              <Icon name="chev-r" size={18} />
            </button>
          </div>
        </div>
      </div>
      <div
        className={clsx('track', dragging && 'drag')}
        ref={track}
        tabIndex={0}
        aria-label="Three steps, scroll sideways"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerLeave={end}
        onKeyDown={onKey}
      >
        {STEPS.map((s) => (
          <article className="stepcard" key={s.t}>
            <DitherPanel className="bgc" options={{ stops: [...s.stops], seed: s.seed, cell: 7 }} />
            <div className="mock" aria-hidden="true">
              <div className="k" style={{ opacity: 0.7, letterSpacing: '0.08em' }}>
                EXAMPLE
              </div>
              {s.mock.map((m, i) =>
                m[0] === 'k' ? (
                  <div className="k" key={i}>
                    {m[1]}
                  </div>
                ) : m[0] === 'btn' ? (
                  <div className="btnmini" key={i}>
                    {m[1]}
                  </div>
                ) : (
                  <div className="row" key={i}>
                    <span>{m[1]}</span>
                    <span>{m[2]}</span>
                  </div>
                ),
              )}
            </div>
            <h3>{s.t}</h3>
            <p>{s.p}</p>
          </article>
        ))}
      </div>
    </>
  );
}

const PHOTO_A = ['#07060f', '#1d1250', '#4b2fd0', '#8b6cff', '#ffb36b'];
const PHOTO_B = ['#04101f', '#0a2a5a', '#1c6bff', '#6fb0ff', '#c9f0ff'];

export function Sheet() {
  const [tab, setTab] = useState<Tab>('syllabus');
  const start = useStart();
  const card = (t: string, p: string, cls: string) => (
    <div className={`cc ${cls}`}>
      <h3>{t}</h3>
      <p>{p}</p>
    </div>
  );
  const photo = (stops: string[], seed: number, cls: string) => (
    <div className={`cc photo ${cls}`}>
      <DitherPanel options={{ stops, seed, cell: 6 }} />
    </div>
  );

  return (
    <section className="sheet sheet-top" aria-labelledby="sheet-h">
      <div className="wrap">
        <div className="sheet-head">
          <span className="label">The idea</span>
          <h2 className="h1" id="sheet-h">
            See your whole course on one page.<span className="accent">Know what to study next.</span>
          </h2>
          <p className="lead" style={{ textAlign: 'center' }}>
            Pick a view.
          </p>
          <Segmented
            className="mono"
            ariaLabel="Preview"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'syllabus', label: 'Your syllabus' },
              { value: 'graph', label: 'Topic map' },
              { value: 'classroom', label: '3D classroom' },
            ]}
          />
        </div>
        <div className="tabcard">
          <div className="tabpane" key={tab}>
            {tab === 'syllabus' ? <SyllabusPane /> : tab === 'graph' ? <MiniGraph /> : <ClassroomPane />}
          </div>
        </div>
      </div>
      <StepTrack />
      <div className="wrap">
        <div style={{ marginTop: 70 }}>
          <h2 className="h1">Why it is easier</h2>
          <p className="lead" style={{ marginTop: 12 }}>
            Everything stays linked.
          </p>
        </div>
        <div className="collage">
          {card('Every topic shows where it came from', 'See the page it came from.', 'c5')}
          {photo(PHOTO_A, 21, 'c4')}
          {card('Guesses are labelled', 'Our guesses are marked.', 'c3')}
          {photo(PHOTO_B, 4, 'c3')}
          {card('Progress is an estimate', 'Based on your answers.', 'c4')}
          {card('Your files stay with you', 'Nothing is uploaded.', 'c5')}
        </div>
        <div className="cta-row">
          <button className="btn solid lg" type="button" onClick={() => start('/app')}>
            Open your workspace
          </button>
          <Link className="btn lg" href="/register">
            Create an account
          </Link>
        </div>
      </div>
    </section>
  );
}
