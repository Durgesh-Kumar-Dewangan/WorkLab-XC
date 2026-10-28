'use client';

import { AiGenAnimation } from '@/components/ui/AiGenAnimation';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon, Spinner } from '@/components/ui/Icon';
import { StatusChip } from '@/components/ui/controls';
import { CourseMissing } from '@/components/app/EmptyWorkspace';
import { AdSlot } from '@/components/ads/AdSlot';
import { LimitNotice } from '@/components/app/LimitNotice';
import { useLesson } from '@/hooks/useLesson';
import { SimPanel, type SimPanelHandle } from '@/components/app/SimPanel';
import { dependents, masteryOf, prereqs, statusFor, topicTitle } from '@/lib/domain/courses';
import { SIM_SPECS, type SimKind, type SimParamValues } from '@/lib/domain/sim';
import { useApp } from '@/lib/store';
import { useCourse, useLearner } from '@/lib/store/hooks';
import { toast } from '@/lib/ui/toast';
import { clamp } from '@/lib/util';

export function LessonPage({ cid, tid }: { cid: string; tid: string }) {
  const d = useLearner();
  const c = useCourse(cid);
  const lesson = useLesson(cid, tid);
  const router = useRouter();
  const sp = useSearchParams();
  const t = c?.topics[tid];
  const slideCount = t?.slides.length ?? 0;
  const [idx, setIdx] = useState(() => clamp(+(sp.get('slide') ?? 0) || 0, 0, Math.max(0, slideCount - 1)));
  const [say, setSay] = useState(() => useApp.getState().settings.captions);
  const panel = useRef<SimPanelHandle>(null);
  const { setLastTopic, addMinutes, logActivity } = useApp.getState();

  useEffect(() => {
    if (!t) return;
    setLastTopic(cid, tid);
    const timer = setInterval(() => {
      if (!document.hidden) useApp.getState().addMinutes(0.25);
    }, 15000);
    return () => clearInterval(timer);
  }, [cid, tid, t, setLastTopic]);

  const go = useCallback(
    (i: number) => {
      const n = clamp(i, 0, Math.max(0, slideCount - 1));
      setIdx(n);
      const p = t?.slides[n]?.p;
      if (p) panel.current?.setParams(p as SimParamValues);
    },
    [slideCount, t],
  );

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (/input|textarea|select/i.test((e.target as HTMLElement).tagName)) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      if (e.key === 'ArrowLeft') go(idx - 1);
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, [go, idx]);

  if (!c || !t) return <CourseMissing />;
  if (lesson.status !== 'ready')
    return (
      <div className="page">
        <div className="ph">
          <div>
            <div className="label">Lesson</div>
            <h1 style={{ marginTop: 8 }}>{topicTitle(d, c, tid)}</h1>
            <p className="sub" aria-live="polite">
              {lesson.status === 'writing'
                ? 'Writing your lesson. The first time this takes up to a minute.'
                : 'The lesson could not be written.'}
            </p>
          </div>
        </div>
        {lesson.status === 'writing' ? (
          <div style={{ display: 'grid', justifyItems: 'center' }}>
            <AiGenAnimation title="Writing your lesson" />
          </div>
        ) : null}
        {lesson.status === 'failed' ? (
          <LimitNotice error={lesson.error} onRetry={lesson.retry} />
        ) : (
          <div className="card row" role="status" style={{ gap: 12 }}>
            <Spinner size={18} />
            <span>Preparing slides, narration and questions…</span>
          </div>
        )}
      </div>
    );
  const s = t.slides[idx];
  const st = statusFor(d, tid);
  const pre = prereqs(d, c, tid);
  const dep = dependents(d, c, tid);
  const demo = t.demo !== 'concept' && t.demo in SIM_SPECS ? (t.demo as SimKind) : null;
  const last = idx >= t.slides.length - 1;
  const formulas = s.f ? (Array.isArray(s.f) ? s.f : [s.f]) : [];

  const finish = () => {
    logActivity(
      'lesson',
      `Finished the lesson on ${topicTitle(d, c, tid)}`,
      `/app/courses/${c.id}/topics/${tid}`,
      c.id,
    );
    addMinutes(Math.max(1, Math.round(t.mins / 3)));
    toast('Lesson marked as finished. Practise it to update your estimate.', 'ok');
    router.push(`/app/courses/${c.id}/practice?topic=${tid}`);
  };

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="row wrap-r">
            <span className="chip mono">{t.mins} min</span>
            <StatusChip status={st} />
            {t.page ? <span className="chip mono">Page {t.page}</span> : null}
          </div>
          <h1 style={{ marginTop: 12 }}>{topicTitle(d, c, tid)}</h1>
          <p className="sub">{t.summary}</p>
        </div>
        <div className="acts">
          <Link href={`/classroom/${c.id}/${tid}`} className="btn solid">
            <Icon name="cube" size={15} />
            Enter classroom
          </Link>
          <Link href={`/app/courses/${c.id}/practice?topic=${tid}`} className="btn">
            <Icon name="target" size={15} />
            Practise
          </Link>
        </div>
      </div>

      {t.demo === 'concept' ? (
        <div className="callout warn">
          <Icon name="info" size={18} />
          <span>
            This is a template lesson. There is no interactive model for it, and the narration only reflects
            the heading from your syllabus.
          </span>
        </div>
      ) : null}

      <div className="lesson-grid">
        <div className="lesson-main">
          <div className="card lesson-slide">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="label">{`Slide ${idx + 1} of ${t.slides.length}`}</span>
              <button
                className="btn xs ghost"
                type="button"
                aria-pressed={say}
                onClick={() => setSay((v) => !v)}
              >
                {say ? 'Hide narration' : 'Show narration'}
              </button>
            </div>
            <h2 className="h2" style={{ marginTop: 4 }}>
              {s.t}
            </h2>
            <ul className="bul">
              {s.b.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
            {formulas.map((f) => (
              <div className="formula" key={f} aria-label={`Formula: ${f}`}>
                {f}
              </div>
            ))}
            {say ? (
              <blockquote className="say">
                <span className="label">Narration</span>
                <p>{s.say}</p>
              </blockquote>
            ) : null}
          </div>

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn sm" type="button" disabled={idx === 0} onClick={() => go(idx - 1)}>
              <Icon name="chev-l" size={14} />
              Back
            </button>
            <div className="dots" role="tablist" aria-label="Slides">
              {t.slides.map((sl, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === idx}
                  aria-label={`Slide ${i + 1}: ${sl.t}`}
                  onClick={() => go(i)}
                />
              ))}
            </div>
            <button className="btn sm solid" type="button" onClick={() => (last ? finish() : go(idx + 1))}>
              {last ? (
                <>
                  Finish lesson
                  <Icon name="check" size={14} />
                </>
              ) : (
                <>
                  Next
                  <Icon name="chev-r" size={14} />
                </>
              )}
            </button>
          </div>

          {demo ? (
            <div className="card">
              <div className="hd">
                <h2>{`Try it: ${SIM_SPECS[demo].title}`}</h2>
                <span className="label">Press play, then change a slider</span>
              </div>
              <SimPanel ref={panel} kind={demo} startParams={t.slides[0].p as SimParamValues | undefined} />
            </div>
          ) : null}
        </div>

        <aside className="lesson-side">
          <div className="card">
            <h3>Objectives</h3>
            <ul className="bul sm">
              {t.obj.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Builds on</h3>
            {pre.length ? (
              <div className="list">
                {pre.map((id) => (
                  <div className="li" key={id}>
                    <div className="grow">
                      <Link href={`/app/courses/${c.id}/topics/${id}`} className="t">
                        {topicTitle(d, c, id)}
                      </Link>
                      <div className="s">{Math.round((masteryOf(d, id).est || 0) * 100)}% estimate</div>
                    </div>
                    <StatusChip status={statusFor(d, id)} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="small">Nothing. This is a starting point.</p>
            )}
            {t.inf && t.inf.length ? (
              <p className="small">
                Some links here are inferences. Review them in the{' '}
                <Link href={`/app/courses/${c.id}/graph`} style={{ textDecoration: 'underline' }}>
                  knowledge graph
                </Link>
                .
              </p>
            ) : null}
          </div>
          {dep.length ? (
            <div className="card">
              <h3>Leads to</h3>
              <div className="list">
                {dep.map((id) => (
                  <div className="li" key={id}>
                    <div className="grow">
                      <Link href={`/app/courses/${c.id}/topics/${id}`} className="t">
                        {topicTitle(d, c, id)}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="card">
            <h3>Source</h3>
            <dl className="kv">
              <dt>Document</dt>
              <dd>{c.sourceName}</dd>
              <dt>Reference</dt>
              <dd>{t.page ? `Page ${t.page}` : 'None found'}</dd>
              <dt>Extraction</dt>
              <dd>{t.uncertain ? 'Uncertain' : 'Clear'}</dd>
            </dl>
            {t.uncertain ? (
              <p className="small">The heading was long or unclear. Check it against your source.</p>
            ) : null}
          </div>
          <AdSlot place="lesson" />
        </aside>
      </div>
    </div>
  );
}
