'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api/client';
import { apiUrl } from '@/lib/config';
import { LessonDiagram } from '@/components/learn/LessonDiagram';
import type { Prepared } from '@/lib/learn';
import { refreshPlay, type Reward } from '@/lib/play';
import { useApp } from '@/lib/store';

type Photo = { id: string; credit: string } | null;

/** A real-world photograph for a slide's example, from the free-licence library, with its credit. */
function useSlidePhoto(query: string | undefined, on: boolean): Photo {
  const [p, setP] = useState<Photo>(null);
  useEffect(() => {
    setP(null);
    if (!query || !on) return;
    let alive = true;
    api<{ id: string; credit: string }>(`/example?q=${encodeURIComponent(query)}`)
      .then((r) => alive && setP({ id: r.id, credit: r.credit }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [query, on]);
  return p;
}

/**
 * The learning side of a session, laid out as a stack of calm cards: the big idea, then each slide as its own card with a
 * photograph of a real example when there is one, then a few questions, then the next steps. One card at a time, no clock, no score.
 * The practice and the points live in the Play tab.
 */
export function WonderCards({ title, p, onPlay }: { title: string; p: Prepared; onPlay: () => void }) {
  const d = p.draft;
  const photosOn = useApp((s) => s.settings.slidePhotos !== false);
  // the cards, in the order a beginner needs them: the idea, built from scratch, each slide, diagrams, words, mistakes, then the questions
  type Step =
    | { k: 'idea' }
    | { k: 'scratch'; n: number }
    | { k: 'slide'; n: number }
    | { k: 'diagram'; n: number }
    | { k: 'words' }
    | { k: 'mistakes' }
    | { k: 'quiz' }
    | { k: 'next' };
  const steps: Step[] = [
    { k: 'idea' },
    ...(d.scratch ?? []).map((_, n): Step => ({ k: 'scratch', n })),
    ...d.slides.map((_, n): Step => ({ k: 'slide', n })),
    ...(d.diagrams ?? []).map((_, n): Step => ({ k: 'diagram', n })),
    ...(d.glossary?.length ? [{ k: 'words' } as Step] : []),
    ...(d.mistakes?.length ? [{ k: 'mistakes' } as Step] : []),
    { k: 'quiz' },
    { k: 'next' },
  ];
  const total = steps.length;
  const [i, setI] = useState(0);
  const [quiz, setQuiz] = useState<Record<number, number>>({});
  const sent = useRef(false);
  const step = steps[Math.min(i, total - 1)];
  const slide = step.k === 'slide' ? d.slides[step.n] : undefined;
  const photo = useSlidePhoto(slide?.example, photosOn);
  const right = d.questions.filter((q, n) => quiz[n] === q.answer).length;
  const answered = Object.keys(quiz).length;

  useEffect(() => {
    if (answered === d.questions.length && !sent.current) {
      sent.current = true;
      api<{ reward?: Reward }>('/learn/progress', {
        body: { title, event: 'quiz', score: right / d.questions.length },
      })
        .then(() => refreshPlay())
        .catch(() => null);
    }
  }, [answered, d.questions.length, right, title]);

  const go = useCallback((n: number) => setI(Math.max(0, Math.min(total - 1, n))), [total]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.key === 'ArrowRight') go(i + 1);
      if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [go, i]);

  return (
    <section className="wc" aria-label="Learn this topic">
      <div
        className="wc-dots"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={i + 1}
        aria-label={`Card ${i + 1} of ${total}`}
      >
        {Array.from({ length: total }, (_, k) => (
          <button
            key={k}
            type="button"
            className={clsx(k === i && 'on', k < i && 'seen')}
            aria-label={`Go to card ${k + 1}`}
            onClick={() => go(k)}
          />
        ))}
      </div>

      <article className="wc-card" key={i}>
        {step.k === 'idea' ? (
          <>
            <span className="wc-kicker">The big idea</span>
            <h2 className="wc-title">{title}</h2>
            <p className="wc-lead">{d.summary}</p>
            <ul className="wc-goals">
              {d.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </>
        ) : null}
        {slide ? (
          <>
            <span className="wc-kicker">{`${(step.k === 'slide' ? step.n : 0) + 1} of ${d.slides.length}`}</span>
            <h2 className="wc-title">{slide.title}</h2>
            <div className={clsx('wc-body', photo && 'with-photo')}>
              <div>
                <ul className="wc-points">
                  {slide.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p className="wc-say">{slide.narration}</p>
                {slide.formula ? <code className="wc-formula">{slide.formula}</code> : null}
              </div>
              {photo ? (
                <figure className="wc-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={apiUrl(`/example-image/${photo.id}`)}
                    alt={`A real example: ${slide.example}`}
                    loading="lazy"
                  />
                  <figcaption>{`Photo: ${photo.credit}`}</figcaption>
                </figure>
              ) : null}
            </div>
          </>
        ) : null}
        {step.k === 'scratch' && d.scratch ? (
          <>
            <span className="wc-kicker">{`From scratch · step ${step.n + 1} of ${d.scratch.length}`}</span>
            <h2 className="wc-title">{d.scratch[step.n].heading}</h2>
            {d.scratch[step.n].body.split(/\n\n+/).map((para, k) => (
              <p key={k} className="wc-lead">
                {para}
              </p>
            ))}
          </>
        ) : null}
        {step.k === 'diagram' && d.diagrams ? (
          <>
            <span className="wc-kicker">See it</span>
            <LessonDiagram d={d.diagrams[step.n]} />
          </>
        ) : null}
        {step.k === 'words' && d.glossary ? (
          <>
            <span className="wc-kicker">Words to know</span>
            <h2 className="wc-title">The vocabulary</h2>
            <dl className="ds-gloss">
              {d.glossary.map((g) => (
                <div key={g.term}>
                  <dt>{g.term}</dt>
                  <dd>{g.meaning}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
        {step.k === 'mistakes' && d.mistakes ? (
          <>
            <span className="wc-kicker">Watch out</span>
            <h2 className="wc-title">Common mistakes</h2>
            <ul className="wc-points">
              {d.mistakes.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        ) : null}
        {step.k === 'quiz' ? (
          <>
            <span className="wc-kicker">Check yourself</span>
            <h2 className="wc-title">What stuck?</h2>
            {d.questions.map((q, n) => (
              <fieldset key={n} className="wc-q">
                <legend>{q.q}</legend>
                {q.options.map((o, k) => {
                  const done = quiz[n] !== undefined;
                  return (
                    <button
                      key={k}
                      type="button"
                      className={clsx(
                        'wc-opt',
                        done && k === q.answer && 'right',
                        done && quiz[n] === k && k !== q.answer && 'wrong',
                      )}
                      disabled={done}
                      onClick={() => setQuiz((cur) => ({ ...cur, [n]: k }))}
                    >
                      {o}
                    </button>
                  );
                })}
                {quiz[n] !== undefined ? <p className="small">{q.why}</p> : null}
              </fieldset>
            ))}
            {answered === d.questions.length ? (
              <p className="wc-score">{`${right} of ${d.questions.length} right`}</p>
            ) : null}
          </>
        ) : null}
        {step.k === 'next' ? (
          <>
            <span className="wc-kicker">Keep going</span>
            <h2 className="wc-title">Where next?</h2>
            <div className="wc-next">
              <button className="btn solid lg" type="button" onClick={onPlay}>
                <Icon name="target" size={16} /> Play a practice round
              </button>
              <Link className="btn lg" href="/app/canvas">
                <Icon name="branch" size={16} /> Explore it on a canvas
              </Link>
              <Link className="btn lg" href="/app/study?tab=teach">
                <Icon name="msg" size={16} /> Teach it back
              </Link>
            </div>
          </>
        ) : null}
      </article>

      <div className="wc-nav">
        <button className="btn" type="button" disabled={i === 0} onClick={() => go(i - 1)}>
          Back
        </button>
        <button className="btn solid" type="button" disabled={i === total - 1} onClick={() => go(i + 1)}>
          {i === 0 ? 'Start' : 'Next'}
        </button>
      </div>
    </section>
  );
}
