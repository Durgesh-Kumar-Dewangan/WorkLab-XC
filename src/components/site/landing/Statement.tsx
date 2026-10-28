'use client';

import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Halftone } from '@/components/fx/Halftone';
import { paintGraph } from '@/lib/fx/painters';
import { useScrollFrame } from '@/hooks/useScrollFrame';
import { clamp } from '@/lib/util';

const WORDS = 'Your syllabus already has a plan inside it. We make it visible.'.split(' ');

/** Scroll-lit statement: words light up as the paragraph crosses the viewport. */
export function Statement() {
  const sec = useRef<HTMLElement>(null);
  const p = useRef<HTMLParagraphElement>(null);
  const [n, setN] = useState(0);

  useScrollFrame(() => {
    const el = p.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const prog = clamp((vh * 0.92 - r.top) / (vh * 0.5), 0, 1.15);
    setN(Math.round(prog * WORDS.length));
  }, sec);

  return (
    <section className="statement" aria-label="Why WorkLab XC" ref={sec}>
      <div className="wrap">
        <div className="fig">
          <Halftone
            paint={paintGraph}
            label="Halftone graph of connected topics"
            options={{
              pitch: 5,
              animate: false,
              fadeX: 0.2,
              fadeBottom: 0.25,
              fadeTop: 0.2,
              srcW: 480,
              srcH: 180,
            }}
          />
        </div>
        <p ref={p}>
          {WORDS.map((w, i) => (
            <span key={i} className={clsx('w', i < n && 'on')}>
              {w}{' '}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
