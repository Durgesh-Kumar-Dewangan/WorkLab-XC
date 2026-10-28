'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { Halftone } from '@/components/fx/Halftone';
import { paintBars, paintClassroom, paintDocument, paintGraph } from '@/lib/fx/painters';
import type { Painter } from '@/lib/fx/halftone';
import { useScrollFrame } from '@/hooks/useScrollFrame';
import { clamp, prefersReducedMotion } from '@/lib/util';

const ERAS = ['Get ready', 'Learn', 'Remember'];
type Kind = 'document' | 'graph' | 'classroom' | 'bars';
const STAGES: { n: string; e: number; t: string; b: string; k: Kind }[] = [
  { n: 'Upload', e: 0, t: 'Add your syllabus', b: 'Drop in a file or paste text.', k: 'document' },
  { n: 'Sort', e: 0, t: 'We sort it into topics', b: 'Headings become topics.', k: 'document' },
  { n: 'Check', e: 0, t: 'You check our work', b: 'Fix anything we got wrong.', k: 'document' },
  { n: 'Connect', e: 1, t: 'See what comes first', b: 'Topics linked in order.', k: 'graph' },
  { n: 'Learn', e: 1, t: 'Learn in the classroom', b: 'The screen and boards walk you through it.', k: 'classroom' },
  { n: 'Practice', e: 1, t: 'Answer and get feedback', b: 'Every answer is explained.', k: 'bars' },
  { n: 'Revise', e: 2, t: 'Return to what is weak', b: 'Weak topics come back.', k: 'bars' },
  { n: 'Next step', e: 2, t: 'Pick what to do next', b: 'We suggest what to do next.', k: 'graph' },
];
const N = STAGES.length;
const PAINTERS: Record<Kind, Painter> = {
  document: paintDocument,
  graph: paintGraph,
  classroom: paintClassroom,
  bars: paintBars,
};

/** Scroll-scrubbed horizontal timeline. The section is tall; a sticky stage shows the current step. */
export function Journey() {
  const sec = useRef<HTMLElement>(null);
  const sticky = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const segs = useRef<(HTMLDivElement | null)[]>([]);
  const ticks = useRef<(HTMLDivElement | null)[]>([]);
  const geom = useRef({ w: 0, unit: 200 });
  const [cur, setCur] = useState(0);
  const curRef = useRef(0);
  curRef.current = cur;
  const lastEra = useRef(-1);

  const paint: Painter = (c, w, h, t) => PAINTERS[STAGES[curRef.current].k](c, w, h, t);

  const jump = (i0: number) => {
    const s = sec.current;
    if (!s) return;
    const i = clamp(i0, 0, N - 1);
    const top = window.scrollY + s.getBoundingClientRect().top;
    const span = s.offsetHeight - window.innerHeight;
    window.scrollTo({
      top: top + (i / (N - 1)) * span + 2,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  useScrollFrame(() => {
    const s = sec.current;
    const st = sticky.current;
    const tr = track.current;
    if (!s || !st || !tr) return;
    const r = s.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = st.clientWidth || window.innerWidth;
    const p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    const f = p * (N - 1);
    const inM = clamp((vh * 0.7 - r.top) / (vh * 0.7), 0, 1);
    const outM = clamp((r.bottom - vh * 0.3) / (vh * 0.7), 0, 1);
    st.style.setProperty('--m', Math.min(inM, outM).toFixed(3));
    if (vw !== geom.current.w) {
      const unit = clamp(vw / 5, 130, 240);
      geom.current = { w: vw, unit };
      const counts = ERAS.map((_, e) => STAGES.filter((x) => x.e === e).length);
      segs.current.forEach((sg, e) => {
        if (sg) sg.style.width = `${counts[e] * unit + (e === 0 || e === ERAS.length - 1 ? vw / 2 : 0)}px`;
      });
      if (segs.current[0]) segs.current[0].style.marginLeft = '0';
      tr.style.paddingLeft = '0';
    }
    const { unit } = geom.current;
    const first = vw / 2;
    ticks.current.forEach((t, i) => {
      if (t) t.style.left = `${first + i * unit + unit / 2}px`;
    });
    tr.style.transform = `translate3d(${vw / 2 - (first + f * unit + unit / 2)}px,0,0)`;
    const idx = clamp(Math.round(f), 0, N - 1);
    const ce = STAGES[idx].e;
    if (ce !== lastEra.current) {
      lastEra.current = ce;
      segs.current.forEach((sg, e) => {
        if (sg) sg.className = `tl-seg ${e < ce ? 'past' : e === ce ? 'now' : 'next'}`;
      });
    }
    setCur((c) => (c === idx ? c : idx));
  }, sec);

  const s = STAGES[cur];
  return (
    <section className="journey" id="journey" aria-label="The journey of one syllabus" ref={sec}>
      <div className="journey-sticky" ref={sticky}>
        <div className="j-ctrl">
          <button className="icon-btn" type="button" aria-label="Previous step" onClick={() => jump(cur - 1)}>
            <Icon name="chev-l" size={18} />
          </button>
          <button className="icon-btn" type="button" aria-label="Next step" onClick={() => jump(cur + 1)}>
            <Icon name="chev-r" size={18} />
          </button>
        </div>
        <div className="j-visual">
          <Halftone
            paint={paint}
            redrawKey={cur}
            label="Halftone image for the current step"
            options={{
              pitch: 5,
              animate: true,
              frameMs: 110,
              fadeX: 0.08,
              fadeBottom: 0.12,
              srcW: 480,
              srcH: 270,
            }}
          />
        </div>
        <div className="j-text">
          <div>
            <div className="j-kicker">{ERAS[s.e]}</div>
            <div className="j-title">{s.t}</div>
            <p className="j-body">{s.b}</p>
          </div>
          <div className="j-events">
            <div className="label">Key events</div>
            {STAGES.map((x, k) => ({ x, k }))
              .filter((o) => o.x.e === s.e)
              .map((o) => (
                <button
                  key={o.k}
                  type="button"
                  className={clsx(o.k === cur && 'on')}
                  onClick={() => jump(o.k)}
                >
                  <i>Step {o.k + 1}</i>
                  {o.x.n}
                </button>
              ))}
          </div>
        </div>
        <div className="tl">
          <div className="tl-track" ref={track}>
            {ERAS.map((e, i) => (
              <div
                key={e}
                className="tl-seg"
                ref={(el) => {
                  segs.current[i] = el;
                }}
              />
            ))}
            {STAGES.map((x, i) => (
              <div
                key={x.n}
                className="tl-tick"
                ref={(el) => {
                  ticks.current[i] = el;
                }}
              >
                <span>
                  {x.n}
                  <em>Step {i + 1}</em>
                </span>
              </div>
            ))}
          </div>
          <div className="tl-play" />
          <div className="tl-now" aria-live="polite">
            Step {cur + 1} of {N} · {s.n}
          </div>
        </div>
      </div>
    </section>
  );
}
