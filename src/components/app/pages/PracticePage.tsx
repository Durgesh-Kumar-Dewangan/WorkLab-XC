'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar, StatusChip } from '@/components/ui/controls';
import { CourseMissing } from '@/components/app/EmptyWorkspace';
import { masteryOf, recommend, statusFor, topicTitle } from '@/lib/domain/courses';
import type { Course, McqQuestion, Mastery, NumQuestion, Question, TopicStatus } from '@/lib/domain/types';
import { useApp } from '@/lib/store';
import { useCourse, useLearner } from '@/lib/store/hooks';

const CONF_LABELS: [string, number][] = [
  ['Not at all', 0.1],
  ['A little', 0.3],
  ['Somewhat', 0.5],
  ['Fairly', 0.7],
  ['Very', 0.9],
];

type McqItem = McqQuestion & { view: string[]; ansView: number };
type Item = McqItem | NumQuestion | Extract<Question, { type: 'conf' }>;
type Result = { ok: boolean } | { conf: number };

function shuffled(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function prepare(qs: Question[]): Item[] {
  return qs.map((x) => {
    if (x.type !== 'mcq') return x;
    const perm = shuffled(x.opts.length);
    return { ...x, view: perm.map((i) => x.opts[i]), ansView: perm.indexOf(x.ans) };
  });
}

/** Routes between topic chooser and a running session. */
export function PracticePage({ cid }: { cid: string }) {
  const sp = useSearchParams();
  const c = useCourse(cid);
  const topic = sp.get('topic');
  if (!c) return <CourseMissing />;
  if (!topic || !c.topics[topic]) return <TopicChooser c={c} />;
  if (!c.topics[topic].ai) return <NeedLesson c={c} tid={topic} />;
  return <Session key={`${topic}:${sp.get('r') ?? ''}`} c={c} tid={topic} />;
}

function TopicChooser({ c }: { c: Course }) {
  const d = useLearner();
  const rec = recommend(d, c);
  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">{c.title}</div>
          <h1 style={{ marginTop: 8 }}>Choose a topic</h1>
          <p className="sub">
            Each set has a few questions and takes about five minutes. Your answers adjust the estimate for
            that topic.
          </p>
        </div>
      </div>
      {rec ? (
        <div className="callout">
          <Icon name="sparkles" size={18} />
          <span>
            <b>Suggested: </b>
            <Link
              href={`/app/courses/${c.id}/practice?topic=${rec.id}`}
              style={{ textDecoration: 'underline' }}
            >
              {topicTitle(d, c, rec.id)}
            </Link>
            {'. '}
            {rec.reason}
          </span>
        </div>
      ) : null}
      {c.units.map((u) => (
        <div className="card" key={u.id}>
          <div className="label">{u.title}</div>
          <div className="list">
            {u.topics.map((id) => {
              const m = masteryOf(d, id);
              return (
                <div className="li" key={id}>
                  <div className="grow">
                    <div className="t">{topicTitle(d, c, id)}</div>
                    <div className="s">
                      {m.att ? `${Math.round(m.est * 100)}% estimate · ${m.att} attempts` : 'No attempts yet'}
                    </div>
                  </div>
                  <StatusChip status={statusFor(d, id)} />
                  <Link
                    href={`/app/courses/${c.id}/practice?topic=${id}`}
                    className="btn xs"
                    aria-label={`Start practice on ${topicTitle(d, c, id)}`}
                  >
                    Start
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface Summary {
  graded: number;
  correct: number;
  m: Mastery;
  st: TopicStatus;
}

function Session({ c, tid }: { c: Course; tid: string }) {
  const t = c.topics[tid];
  const d = useLearner();
  const router = useRouter();
  const [items] = useState(() => prepare(t.qs));
  const [before] = useState(() => {
    const a = useApp.getState();
    return { est: a.mastery[tid]?.est ?? 0, st: statusFor(a, tid) };
  });
  const [startedAt] = useState(() => Date.now());
  const [i, setI] = useState(0);
  const [res, setRes] = useState<Result[]>([]);
  const [sum, setSum] = useState<Summary | null>(null);

  const head = (
    <div className="ph">
      <div>
        <div className="label">{`${c.title} · Practice`}</div>
        <h1 style={{ marginTop: 8 }}>{topicTitle(d, c, tid)}</h1>
      </div>
      <div className="acts">
        <Link href={`/app/courses/${c.id}/topics/${tid}`} className="btn">
          <Icon name="book" size={15} />
          Review lesson
        </Link>
        <Link href={`/app/courses/${c.id}/practice`} className="btn ghost">
          Other topics
        </Link>
      </div>
    </div>
  );

  const finish = (all: Result[]) => {
    const a = useApp.getState();
    const graded = all.filter((r): r is { ok: boolean } => 'ok' in r);
    const correct = graded.filter((r) => r.ok).length;
    const m = masteryOf(a, tid);
    const st = statusFor(a, tid);
    const title = topicTitle(a, c, tid);
    a.addMinutes(Math.max(1, Math.round((Date.now() - startedAt) / 60000)));
    a.logActivity(
      'practice',
      `Practised ${title}${graded.length ? `: ${correct} of ${graded.length} correct` : ': self-rating recorded'}`,
      `/app/courses/${c.id}/practice?topic=${tid}`,
      c.id,
    );
    if (st === 'review' && before.st !== 'review')
      a.notify(
        'revision',
        `${title} needs another pass`,
        `Your estimate is ${Math.round(m.est * 100)}% after ${m.att} attempts.`,
        `/app/courses/${c.id}/topics/${tid}`,
      );
    if (st === 'mastered' && before.st !== 'mastered')
      a.notify(
        'progress',
        `${title} is now a strong topic`,
        `Estimate ${Math.round(m.est * 100)}% after ${m.att} attempts. Estimates can still be wrong, so revisit it later.`,
        `/app/courses/${c.id}/topics/${tid}`,
      );
    setSum({ graded: graded.length, correct, m, st });
  };

  if (sum) {
    const rec = recommend(d, c);
    const delta = Math.round((sum.m.est - before.est) * 100);
    return (
      <div className="page">
        {head}
        <div className="card qcard">
          <span className="label">Results</span>
          <h2 className="qtext">
            {sum.graded ? `${sum.correct} of ${sum.graded} correct` : 'Self-rating recorded'}
          </h2>
          <div className="g3">
            <div className="stat">
              <span className="label">Estimate before</span>
              <div className="v">{Math.round(before.est * 100)}%</div>
            </div>
            <div className="stat">
              <span className="label">Estimate now</span>
              <div className="v">
                {Math.round(sum.m.est * 100)}%<small>{(delta >= 0 ? '+' : '') + delta}</small>
              </div>
            </div>
            <div className="stat">
              <span className="label">Status</span>
              <div style={{ marginTop: 6 }}>
                <StatusChip status={sum.st} />
              </div>
            </div>
          </div>
          <p className="small">{`This number is an estimate built from ${sum.m.att} answer${sum.m.att === 1 ? '' : 's'} so far. Few answers make it noisy, and it is not a measure of ability.`}</p>
          {rec ? (
            <div className="callout">
              <Icon name="sparkles" size={18} />
              <span>
                <b>Suggested next: </b>
                {topicTitle(d, c, rec.id)}
                {'. '}
                {rec.reason}
              </span>
            </div>
          ) : null}
          <div className="row wrap-r">
            <button
              className="btn solid"
              type="button"
              onClick={() => router.push(`/app/courses/${c.id}/practice?topic=${tid}&r=${Date.now()}`)}
            >
              <Icon name="replay" size={15} />
              Practise again
            </button>
            {rec && rec.id !== tid ? (
              <Link href={`/app/courses/${c.id}/topics/${rec.id}`} className="btn">
                Open suggested topic
              </Link>
            ) : null}
            <Link href="/app/progress" className="btn ghost">
              See progress
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {head}
      <QuestionCard
        key={i}
        x={items[i]}
        index={i}
        total={items.length}
        courseId={c.id}
        tid={tid}
        onNext={(r) => {
          const all = [...res, r];
          setRes(all);
          if (i + 1 < items.length) setI(i + 1);
          else finish(all);
        }}
      />
    </div>
  );
}

function QuestionCard({
  x,
  index,
  total,
  courseId,
  tid,
  onNext,
}: {
  x: Item;
  index: number;
  total: number;
  courseId: string;
  tid: string;
  onNext: (r: Result) => void;
}) {
  const name = useId();
  const [chosen, setChosen] = useState<number | string | null>(null);
  const [checked, setChecked] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; streak: number } | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const num = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (x.type === 'num') {
      const t = setTimeout(() => num.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [x.type]);
  useEffect(() => {
    if (checked) next.current?.focus();
  }, [checked]);

  const canCheck = chosen !== null && chosen !== '';
  const check = () => {
    if (checked || !canCheck) return;
    const a = useApp.getState();
    setChecked(true);
    if (x.type === 'conf') {
      a.recordConfidence(tid, chosen as number);
      return;
    }
    let ok: boolean;
    if (x.type === 'mcq') ok = chosen === x.ansView;
    else {
      const v = parseFloat(
        String(chosen)
          .replace(',', '.')
          .replace(/[^0-9.\-eE]/g, ''),
      );
      ok = Number.isFinite(v) && Math.abs(v - x.ans) <= Math.max(x.tol, Math.abs(x.ans) * 0.02);
    }
    a.recordAnswer(tid, ok);
    setOut({ ok, streak: useApp.getState().mastery[tid]?.wrongStreak ?? 0 });
  };
  const resultOf = (): Result => (x.type === 'conf' ? { conf: chosen as number } : { ok: !!out?.ok });

  return (
    <div className="card qcard">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">
          {`Question ${index + 1} of ${total}` + (x.type === 'conf' ? ' · self-rating' : '')}
        </span>
        <div style={{ width: 120 }}>
          <ProgressBar value={index / total} className="blue" />
        </div>
      </div>
      <h2 className="qtext">{x.q}</h2>

      {x.type === 'mcq' ? (
        <div className="opts" role="radiogroup" aria-label="Answer choices">
          {x.view.map((o, k) => (
            <label
              key={k}
              className={clsx('opt', checked && (k === x.ansView ? 'right' : k === chosen ? 'wrong' : ''))}
            >
              <input
                type="radio"
                name={name}
                value={k}
                checked={chosen === k}
                disabled={checked}
                onChange={() => setChosen(k)}
              />
              <span className="mk">{String.fromCharCode(65 + k)}</span>
              <span>{o}</span>
            </label>
          ))}
        </div>
      ) : x.type === 'num' ? (
        <div className="row">
          <input
            ref={num}
            className="input"
            type="text"
            inputMode="decimal"
            placeholder="Type a number"
            aria-label={`Your answer${x.unit ? ` in ${x.unit}` : ''}`}
            style={{ maxWidth: 220 }}
            disabled={checked}
            value={typeof chosen === 'string' ? chosen : ''}
            onChange={(e) => setChosen(e.target.value.trim())}
            onKeyDown={(e) => e.key === 'Enter' && check()}
          />
          {x.unit ? <span className="mono dim">{x.unit}</span> : null}
        </div>
      ) : (
        <div className="opts conf" role="radiogroup" aria-label="Confidence">
          {CONF_LABELS.map(([l, v]) => (
            <label className="opt" key={l}>
              <input
                type="radio"
                name={name}
                value={v}
                checked={chosen === v}
                disabled={checked}
                onChange={() => setChosen(v)}
              />
              <span>{l}</span>
            </label>
          ))}
        </div>
      )}

      <div aria-live="polite">
        {checked && x.type === 'conf' ? (
          <div className="callout">
            <Icon name="info" size={18} />
            <span>{x.why}</span>
          </div>
        ) : null}
        {out && x.type !== 'conf' ? (
          <>
            <div className={clsx('callout', !out.ok && 'warn')} role="status">
              <Icon name={out.ok ? 'check' : 'info'} size={18} />
              <span>
                <b>
                  {out.ok
                    ? 'Correct. '
                    : x.type === 'num'
                      ? `Not quite. The answer is ${x.ans}${x.unit ? ` ${x.unit}` : ''}. `
                      : 'Not quite. '}
                </b>
                {x.why}
                {x.type === 'num' ? ' (Answers within 2% are accepted.)' : ''}
              </span>
            </div>
            {!out.ok && out.streak >= 2 ? (
              <div className="callout warn" style={{ marginTop: 10 }}>
                <Icon name="alert" size={18} />
                <span>
                  Two misses in a row. A quick look at the{' '}
                  <Link
                    href={`/app/courses/${courseId}/topics/${tid}`}
                    style={{ textDecoration: 'underline' }}
                  >
                    lesson
                  </Link>{' '}
                  may help before you carry on.
                </span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="row">
        {!checked ? (
          <button className="btn solid" type="button" disabled={!canCheck} onClick={check}>
            {x.type === 'conf' ? 'Record rating' : 'Check answer'}
          </button>
        ) : (
          <button ref={next} className="btn solid" type="button" onClick={() => onNext(resultOf())}>
            {index < total - 1 ? 'Next question' : 'See results'}
          </button>
        )}
      </div>
    </div>
  );
}


/** Practice questions are written together with the lesson, so a topic needs its lesson first. */
function NeedLesson({ c, tid }: { c: Course; tid: string }) {
  const d = useLearner();
  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">{`${c.title} · Practice`}</div>
          <h1 style={{ marginTop: 8 }}>{topicTitle(d, c, tid)}</h1>
        </div>
      </div>
      <div className="empty">
        <Icon name="book" size={26} />
        <h2 className="h3">Study this topic first</h2>
        <p className="body">The practice questions are written along with the lesson, from your syllabus. Open the lesson once and they will be ready.</p>
        <Link href={`/app/courses/${c.id}/topics/${tid}`} className="btn solid">
          Open the lesson
        </Link>
      </div>
    </div>
  );
}
