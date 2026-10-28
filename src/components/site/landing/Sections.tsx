'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DitherPanel } from '@/components/fx/DitherPanel';
import { useStart } from '@/hooks/useStart';
import { scramble } from '@/lib/fx/scramble';
import { prefersReducedMotion } from '@/lib/util';
import { PlansView } from './Plans';
import { ContactForm } from './ContactForm';

/* ---------------- bento ---------------- */
const BENTO_ROWS: [string, number, number][] = [
  ['Newton’s second law', 0.41, 0.63],
  ['Force and free-body diagrams', 0.62, 0.78],
  ['Projectile motion', 0.38, 0.55],
  ['Kinematic equations', 0.52, 0.71],
];
const REC: [string, string][] = [
  ['Topic', 'Newton’s second law'],
  ['Found on', 'physics-101.pdf, page 4'],
  ['Learn first', 'Force and free-body diagrams'],
  ['Guessed by us?', 'No, your syllabus says so'],
  ['Includes', '5 slides and 3 questions'],
];

export function Bento() {
  const start = useStart();
  const barsRef = useRef<HTMLDivElement>(null);
  const r = 70;
  const circ = 2 * Math.PI * r;

  useEffect(() => {
    const el = barsRef.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        el.querySelectorAll<HTMLElement>('.pair i').forEach((b, k) => {
          b.animate([{ width: '0%' }, { width: b.style.width }], {
            duration: 700,
            delay: k * 40,
            easing: 'cubic-bezier(.2,.8,.2,1)',
          });
        });
        io.disconnect();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="bento-sec" aria-labelledby="bento-h">
      <div className="wrap">
        <h2 className="h1" id="bento-h" style={{ maxWidth: '16ch' }}>
          Know how you are doing, and why.
        </h2>
        <p className="lead" style={{ marginTop: 14 }}>
          Every estimate shows how it was reached. The numbers on this page are an example; yours come from your own
          answers.
        </p>
        <div className="bento">
          <div className="bc a">
            <span className="label">Mastery</span>
            <h3>How well you know it</h3>
            <div className="gauge" role="img" aria-label="Mastery estimate">
              <svg viewBox="0 0 180 180">
                <circle cx={90} cy={90} r={r} fill="none" stroke="var(--gray-bar)" strokeWidth={12} />
                <circle
                  cx={90}
                  cy={90}
                  r={r}
                  fill="none"
                  stroke="var(--green)"
                  strokeWidth={12}
                  strokeLinecap="round"
                  strokeDasharray={`${circ * 0.72} ${circ}`}
                />
              </svg>
              <div className="v">
                <b className="num">72%</b>
                <span className="label">estimate</span>
              </div>
            </div>
            <p>Updates after every answer.</p>
          </div>
          <div className="bc b">
            <span className="label">Source trace</span>
            <h3>Every topic points back to your file</h3>
            <dl className="plainrec">
              {REC.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="bc c">
            <span className="label">Relationships</span>
            <h3>How topics connect</h3>
            <ul className="rels">
              <li>
                <i />
                requires
              </li>
              <li>
                <i className="v" />
                part of
              </li>
              <li>
                <i className="g" />
                explains
              </li>
              <li>
                <i className="d" />
                inferred, to review
              </li>
            </ul>
          </div>
          <div className="bc d">
            <span className="label">Next step</span>
            <h3>Review Force and free-body diagrams first</h3>
            <p>You are at 41% here. Force is at 62%.</p>
            <button
              className="btn sm"
              type="button"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => start('/app')}
            >
              Open lesson <Icon name="chev-r" size={14} />
            </button>
          </div>
          <div className="bc e">
            <span className="label">Example: one 20 minute study session</span>
            <h3>How much better each topic got</h3>
            <div className="bars" ref={barsRef}>
              {BENTO_ROWS.map((r2) => (
                <div className="barrow" key={r2[0]}>
                  <span>{r2[0]}</span>
                  <div className="pair">
                    <i className="b0" style={{ width: `${r2[1] * 100}%` }} />
                    <i className="b1" style={{ width: `${r2[2] * 100}%` }} />
                  </div>
                  <span className="delta num">+{Math.round((r2[2] - r2[1]) * 100)}</span>
                </div>
              ))}
            </div>
            <div className="legend">
              <span>
                <i style={{ background: 'var(--gray-bar)' }} />
                Before
              </span>
              <span>
                <i style={{ background: 'var(--green)' }} />
                After
              </span>
            </div>
            <p className="small">Example data.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- what is real / simulated ---------------- */
/* ---------------- FAQ ---------------- */
const QA: [string, string][] = [
  [
    'Is the AI real?',
    'Yes. Lessons, questions and tutor answers are written by AI models through the WorkLab XC server, and reused when the same topic comes up again. AI can be wrong, so check important facts against your textbook.',
  ],
  [
    'Where does my syllabus go?',
    'It goes to the WorkLab XC server, which reads it and saves the course to your account. We do not send your name or email to AI providers, and your files are never shared with other learners.',
  ],
  [
    'Can I use my own 3D room?',
    'Yes. Open the asset library and add a GLB or GLTF file. It is checked in your browser and kept in this browser’s storage, not uploaded. The built-in lecture hall is the fallback.',
  ],
  [
    'What does mastery mean here?',
    'It is an estimate from your answers so far. It can be wrong, it says how it was reached, and it is not a measure of ability.',
  ],
  [
    'Does it work on a phone?',
    'The pages adapt to phone width. The 3D classroom works best on a larger screen, and its panels become drawers on small ones.',
  ],
  [
    'Can I turn off the motion?',
    'Yes. Settings has a motion switch, and the site follows your system’s reduced-motion setting.',
  ],
];

function QaItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const ans = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ans.current;
    if (!el) return;
    if (!open) {
      el.textContent = '';
      return;
    }
    return scramble(el, a, 500);
  }, [open, a]);
  return (
    <div className="qa">
      <h3>{q}</h3>
      <button type="button" className="tg" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{open ? 'Hide answer' : 'Show answer'}</span>
        <Icon name={open ? 'minus' : 'plus'} size={14} />
      </button>
      <p className="ans" hidden={!open} ref={ans} />
    </div>
  );
}

export function Faq() {
  return (
    <section className="faq" id="faq" aria-labelledby="faq-h">
      <div className="wrap">
        <h2 className="h1" id="faq-h">
          Frequently asked questions
        </h2>
        <div className="faq-list">
          {QA.map(([q, a]) => (
            <QaItem key={q} q={q} a={a} />
          ))}
        </div>
        <p style={{ marginTop: 22 }}>
          <Link className="btn" href="/help">
            See all questions in the help centre <Icon name="chev-r" size={13} />
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ---------------- closing CTA ---------------- */
export function Cta() {
  const start = useStart();
  return (
    <section className="cta" aria-labelledby="cta-h">
      <div className="wrap">
        <div className="cta-panel">
          <DitherPanel
            options={{
              stops: ['#07060f', '#1d1250', '#4b2fd0', '#b06cff', '#ffa06b'],
              seed: 31,
              cell: 8,
              angle: 1.4,
            }}
          />
          <div>
            <h2 className="h1" id="cta-h">
              Start with one syllabus.
            </h2>
            <p>Upload your syllabus and open your first lesson in a few minutes.</p>
            <div className="hero-cta" style={{ justifyContent: 'center' }}>
              <button className="btn solid lg" type="button" onClick={() => start('/app')}>
                Get started
              </button>
              <Link className="btn lg" href="/register">
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- pricing teaser + contact ---------------- */
export function PricingTeaser() {
  return (
    <section className="price-sec" id="pricing" aria-labelledby="pr-h">
      <div className="wrap">
        <span className="label">Pricing</span>
        <h2 className="h1" id="pr-h" style={{ maxWidth: '18ch', marginTop: 12 }}>
          Start free. Upgrade when you need more.
        </h2>
        <p className="lead" style={{ marginTop: 14 }}>
          Free is supported by ads. Beta is the paid plan: the 3D classroom, no ads, unlimited subjects,
          games and quizzes.
        </p>
        <PlansView />
        <p className="plans-note">
          Need something else? <Link href="/contact">Talk to us</Link> or{' '}
          <Link href="/pricing">compare every feature</Link>.
        </p>
      </div>
    </section>
  );
}

export function ContactSection() {
  return (
    <section className="ct-sec" id="contact" aria-labelledby="ct-h">
      <div className="wrap">
        <div className="ct-grid">
          <div>
            <span className="label">Talk to us</span>
            <h2 className="h1" id="ct-h" style={{ marginTop: 12 }}>
              Tell us the course you would try first.
            </h2>
            <p className="lead" style={{ marginTop: 14 }}>
              A short note is enough. We reply by email.
            </p>
            <ul className="ct-list">
              {(
                [
                  ['clock', 'A 20 minute walkthrough'],
                  ['upload', 'Bring one syllabus, any format'],
                  ['eye', 'See where each topic came from'],
                ] as const
              ).map(([ic, t]) => (
                <li key={t}>
                  <Icon name={ic} size={16} />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="ct-card">
            <ContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}
