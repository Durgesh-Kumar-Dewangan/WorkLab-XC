'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { paintStackLayer } from '@/lib/fx/stackLayers';
import { elProgress } from '@/lib/fx/scrollFrames';
import { useScrollFrame } from '@/hooks/useScrollFrame';
import { clamp, ease, lerp } from '@/lib/util';

const LAYERS = [
  { cls: 'l1', label: 'Layer 1', title: 'Your file', text: 'Your syllabus, as you added it.' },
  { cls: 'l2', label: 'Layer 2', title: 'Topic list', text: 'Split into units and topics.' },
  { cls: 'l3', label: 'Layer 3', title: 'Topic map', text: 'What comes first.' },
  { cls: 'l4', label: 'Layer 4', title: 'Lessons', text: 'Slides, 3D demo, questions.' },
];

/** Exploded 3D layer stack that separates as the section scrolls into view, with leader lines to each note. */
export function How() {
  const stage = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const layerEls = useRef<(HTMLDivElement | null)[]>([]);
  const noteEls = useRef<(HTMLDivElement | null)[]>([]);
  const lines = useRef<(SVGLineElement | null)[]>([]);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const lastP = useRef(-1);
  const [hot, setHot] = useState<number | null>(null);

  useEffect(() => {
    canvases.current.forEach((cv, k) => cv && paintStackLayer(cv, k));
  }, []);

  useScrollFrame(() => {
    const st = stage.current;
    const sk = stack.current;
    const sv = svg.current;
    if (!st || !sk || !sv) return;
    const p = elProgress(st, 0.95, 0.25);
    const narrow = window.innerWidth <= 980;
    if (Math.abs(p - lastP.current) < 0.0015 && !narrow) return;
    lastP.current = p;
    const gap = lerp(34, 120, ease(clamp(p * 1.8, 0, 1)));
    sk.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    sk.style.transform = `rotateX(60deg) rotateZ(${lerp(-38, -30, p).toFixed(2)}deg) translateZ(${(-gap * 1.5).toFixed(1)}px)`;
    sv.style.display = narrow ? 'none' : '';
    if (narrow) return;
    const sr = st.getBoundingClientRect();
    noteEls.current.forEach((n, k) => {
      const le = layerEls.current[k];
      if (!n || !le) return;
      const nr = n.getBoundingClientRect();
      const lr = le.getBoundingClientRect();
      const left = k === 0 || k === 2;
      const x1 = (left ? nr.right : nr.left) - sr.left;
      const y1 = nr.top + nr.height / 2 - sr.top;
      const x2 = lr.left + lr.width / 2 - sr.left + (left ? -lr.width * 0.18 : lr.width * 0.18);
      const y2 = lr.top + lr.height / 2 - sr.top;
      const l = lines.current[k];
      const d = dots.current[k];
      if (l) {
        l.setAttribute('x1', String(x1));
        l.setAttribute('y1', String(y1));
        l.setAttribute('x2', String(x2));
        l.setAttribute('y2', String(y2));
      }
      if (d) {
        d.setAttribute('cx', String(x2));
        d.setAttribute('cy', String(y2));
      }
    });
  }, stage);

  const note = (k: number) => {
    const l = LAYERS[k];
    return (
      <div
        className={clsx('note', hot === k && 'hot')}
        tabIndex={0}
        ref={(el) => {
          noteEls.current[k] = el;
        }}
        onMouseEnter={() => setHot(k)}
        onMouseLeave={() => setHot(null)}
        onFocus={() => setHot(k)}
        onBlur={() => setHot(null)}
      >
        <span className="label">{l.label}</span>
        <h3>{l.title}</h3>
        <p>{l.text}</p>
      </div>
    );
  };

  return (
    <section className="how" id="how" aria-labelledby="how-h">
      <div className="wrap">
        <div className="how-title">
          <h2 className="h1" id="how-h">
            What you get
          </h2>
          <p className="lead">Tap a layer.</p>
        </div>
        <div className="how-stage" ref={stage}>
          <div className="how-col l">
            {note(2)}
            {note(0)}
          </div>
          <div className="stack-wrap">
            <div className="stack" ref={stack}>
              {LAYERS.map((l, i) => (
                <div
                  key={l.cls}
                  className={clsx('layer', l.cls, hot === i && 'hot')}
                  style={{ ['--i' as string]: i }}
                  ref={(el) => {
                    layerEls.current[i] = el;
                  }}
                >
                  <canvas
                    aria-hidden="true"
                    ref={(el) => {
                      canvases.current[i] = el;
                    }}
                    style={hot === i ? { filter: 'brightness(1.25)' } : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="how-col r">
            {note(3)}
            {note(1)}
          </div>
          <svg className="stack-lines" aria-hidden="true" ref={svg}>
            {LAYERS.map((l, k) => (
              <g key={l.cls}>
                <line
                  ref={(el) => {
                    lines.current[k] = el;
                  }}
                />
                <circle
                  r={3}
                  ref={(el) => {
                    dots.current[k] = el;
                  }}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}
