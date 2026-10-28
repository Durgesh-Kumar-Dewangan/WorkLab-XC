'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { AiGenAnimation } from '@/components/ui/AiGenAnimation';
import { DrillPlayer } from '@/components/app/DrillPlayer';
import { PlayStrip } from '@/components/app/PlayStrip';
import { DeepSections } from '@/components/learn/DeepSections';
import { WonderCards } from '@/components/app/WonderCards';
import { Icon, Spinner } from '@/components/ui/Icon';
import { LimitNotice } from '@/components/app/LimitNotice';
import { api, ApiFail } from '@/lib/api/client';
import { useApp } from '@/lib/store';
import { startLearning, STOP_CODES, type GameRound, type Prepared, type ProblemsOut } from '@/lib/learn';
import { toast } from '@/lib/ui/toast';

type Tab = 'cards' | 'lesson' | 'drill' | 'game' | 'problems' | 'ask';
const STATE_TEXT: Record<string, string> = {
  reused: 'Reused from your saved library',
  shared: 'Reused from lessons made for your syllabus',
  generated: 'Freshly written and saved',
  saved: 'Saved copy',
};

/** Slide-and-audio lesson. Works on any device: no WebGL needed. */
export function LearnSession() {
  const sp = useSearchParams();
  const title = sp.get('title') ?? '';
  const courseId = sp.get('courseId');
  const topicId = sp.get('topicId');
  const [phase, setPhase] = useState<'starting' | 'writing' | 'ready' | 'failed'>('starting');
  const [err, setErr] = useState<ApiFail | null>(null);
  const [data, setData] = useState<Prepared | null>(null);
  const [sessionId, setSessionId] = useState('');
  const style = useApp((s) => s.settings.sessionStyle) ?? 'duolingo';
  const [tab, setTab] = useState<Tab>(
    style === 'wondering' ? 'cards' : style === 'classic' ? 'lesson' : 'drill',
  );
  const started = useRef(false);

  const begin = useCallback(async () => {
    setErr(null);
    setPhase('starting');
    try {
      const id = sessionId || (await startLearning(courseId, topicId));
      setSessionId(id);
      setPhase('writing');
      setData(
        await api<Prepared>('/learn/prepare', {
          body: {
            sessionId: id,
            title,
            courseTitle: sp.get('course') ?? undefined,
            depth: useApp.getState().settings.depth ?? 'standard',
          },
        }),
      );
      setPhase('ready');
    } catch (e) {
      setErr(e as ApiFail);
      setPhase('failed');
    }
  }, [sessionId, courseId, topicId, title, sp]);
  useEffect(() => {
    if (started.current || title.length < 2) return;
    started.current = true;
    void begin();
  }, [begin, title]);

  if (title.length < 2)
    return (
      <div className="page">
        <div className="callout">
          <Icon name="info" size={18} />
          <span>
            Pick a topic from <Link href="/app/learn?view=path">Learn</Link> to begin.
          </span>
        </div>
      </div>
    );

  return (
    <div className="page learn">
      <div className="ph">
        <div>
          <div className="label">Learning session</div>
          <h1 style={{ marginTop: 8 }}>{title}</h1>
          <p className="sub" aria-live="polite">
            {phase === 'ready' && data
              ? STATE_TEXT[data.state]
              : phase === 'failed'
                ? 'Could not start'
                : phase === 'writing'
                  ? 'Preparing your lesson… this can take up to a minute the first time.'
                  : 'Starting your session…'}
          </p>
        </div>
        <div className="acts">
          <Link className="btn sm" href="/app/learn?view=path">
            All topics
          </Link>
        </div>
      </div>
      {phase === 'failed' && err ? <LimitNotice error={err} onRetry={() => void begin()} /> : null}
      {phase === 'failed' && err && !STOP_CODES.has(err.code) && err.code !== 'network' ? (
        <button className="btn" type="button" onClick={() => void begin()}>
          Try again
        </button>
      ) : null}
      {phase === 'starting' || phase === 'writing' ? (
        phase === 'starting' ? (
          <div className="card row" role="status" style={{ gap: 12 }}>
            <Spinner size={18} />
            <span>Checking your allowance…</span>
          </div>
        ) : (
          <div style={{ display: 'grid', justifyItems: 'center' }}>
            <AiGenAnimation title="Writing your session" />
          </div>
        )
      ) : null}
      {phase === 'ready' && data ? (
        <>
          <PlayStrip />
          <div className="tabs" role="tablist" aria-label="Session parts">
            {(
              [
                ['cards', 'Learn'],
                ['drill', 'Play'],
                ['lesson', 'Lesson page'],
                ['game', 'Game'],
                ['problems', 'Practice problems'],
                ['ask', 'Ask the class'],
              ] as [Tab, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                role="tab"
                type="button"
                id={`tab-${k}`}
                aria-selected={tab === k}
                aria-controls={`panel-${k}`}
                onClick={() => setTab(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'cards' ? (
              <WonderCards title={data.title} p={data} onPlay={() => setTab('drill')} />
            ) : null}
            {tab === 'lesson' ? (
              <Lesson title={data.title} p={data} onPractice={() => setTab('drill')} />
            ) : null}
            {tab === 'drill' ? <DrillPlayer title={data.title} /> : null}
            {tab === 'game' ? <Game title={data.title} /> : null}
            {tab === 'problems' ? <Problems title={data.title} /> : null}
            {tab === 'ask' ? <Ask title={data.title} /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Lesson({ title, p, onPractice }: { title: string; p: Prepared; onPractice: () => void }) {
  const d = p.draft;
  const [i, setI] = useState(0);
  const [quiz, setQuiz] = useState<Record<number, number>>({});
  const [saved, setSaved] = useState(false);
  const slide = d.slides[i];
  const answered = Object.keys(quiz).length;
  const right = d.questions.filter((q, n) => quiz[n] === q.answer).length;
  useEffect(() => {
    if (answered === d.questions.length && !saved) {
      setSaved(true);
      api('/learn/progress', { body: { title, event: 'quiz', score: right / d.questions.length } }).catch(
        () => null,
      );
    }
  }, [answered, d.questions.length, right, saved, title]);

  return (
    <div className="learn-grid">
      <section className="card learn-stage" aria-label="Slides">
        <div className="learn-slide" aria-live="polite">
          <div className="label">
            Slide {i + 1} of {d.slides.length}
          </div>
          <h2 className="h2">{slide.title}</h2>
          <ul>
            {slide.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {slide.formula ? <p className="mono learn-formula">{slide.formula}</p> : null}
          <p className="learn-caption" aria-label="Narration">
            {slide.narration}
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={d.slides.length - 1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          aria-label="Jump to slide"
        />
      </section>
      <aside className="learn-side">
        <section className="card">
          <h3>What you will learn</h3>
          <ul>
            {d.objectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
        <section className="card" aria-label="Check yourself">
          <h3>Check yourself</h3>
          {d.questions.map((q, n) => (
            <fieldset key={q.q} className="learn-q">
              <legend>
                {n + 1}. {q.q}
              </legend>
              {q.options.map((o, k) => {
                const picked = quiz[n] === k;
                const done = quiz[n] !== undefined;
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={done}
                    className={clsx('btn sm learn-opt', picked && 'solid')}
                    onClick={() => setQuiz((s) => ({ ...s, [n]: k }))}
                  >
                    {o}
                    {done && k === q.answer ? ' ✓ correct' : done && picked ? ' ✗ not quite' : ''}
                  </button>
                );
              })}
              {quiz[n] !== undefined ? (
                <p className="small" role="status">
                  {q.why}
                </p>
              ) : null}
            </fieldset>
          ))}
          {answered === d.questions.length ? (
            <p role="status">
              <b>
                {right} of {d.questions.length} right.
              </b>{' '}
              Your progress is saved.
            </p>
          ) : null}
          {answered === d.questions.length || i === d.slides.length - 1 ? (
            <button className="btn solid" type="button" onClick={onPractice}>
              <Icon name="target" size={15} /> Start a practice round
            </button>
          ) : null}
        </section>
      </aside>
      <DeepSections d={d} />
    </div>
  );
}

function Game({ title }: { title: string }) {
  const [rounds, setRounds] = useState<GameRound[] | null>(null);
  const [err, setErr] = useState<ApiFail | null>(null);
  const [ans, setAns] = useState<unknown[]>([]);
  const [res, setRes] = useState<{
    score: number;
    correct: number;
    total: number;
    detail: Array<{ ok: boolean; why?: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (fresh = false) => {
      setBusy(true);
      setErr(null);
      setRes(null);
      setAns([]);
      try {
        setRounds((await api<{ rounds: GameRound[] }>('/learn/game', { body: { title, fresh } })).rounds);
      } catch (e) {
        setErr(e as ApiFail);
      } finally {
        setBusy(false);
      }
    },
    [title],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const submit = async () => {
    setBusy(true);
    try {
      setRes(
        await api('/learn/game', {
          method: 'PUT',
          body: { title, answers: rounds!.map((_, n) => ans[n] ?? null) },
        }),
      );
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    } finally {
      setBusy(false);
    }
  };
  if (err) return <LimitNotice error={err} onRetry={() => void load()} />;
  if (!rounds)
    return (
      <div className="card row" role="status" style={{ gap: 12 }}>
        <Spinner size={18} />
        <span>Building your game…</span>
      </div>
    );
  const set = (n: number, v: unknown) =>
    setAns((a) => {
      const x = [...a];
      x[n] = v;
      return x;
    });
  return (
    <div className="card learn-game">
      <h2 className="h3">Topic game</h2>
      {rounds.map((r, n) => (
        <fieldset key={n} className="learn-q" disabled={!!res}>
          {r.type === 'tf' ? (
            <>
              <legend>
                {n + 1}. True or false: {r.statement}
              </legend>
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={ans[n] === v}
                  className={clsx('btn sm', ans[n] === v && 'solid')}
                  onClick={() => set(n, v)}
                >
                  {v ? 'True' : 'False'}
                </button>
              ))}
            </>
          ) : r.type === 'order' ? (
            <OrderRound n={n} r={r} value={(ans[n] as string[]) ?? []} onChange={(v) => set(n, v)} />
          ) : (
            <MatchRound
              n={n}
              r={r}
              value={(ans[n] as Record<string, string>) ?? {}}
              onChange={(v) => set(n, v)}
            />
          )}
          {res ? (
            <p className="small" role="status">
              {res.detail[n].ok ? '✓ Correct' : '✗ Not quite'}
              {res.detail[n].why ? ` — ${res.detail[n].why}` : ''}
            </p>
          ) : null}
        </fieldset>
      ))}
      {res ? (
        <div role="status">
          <b>
            {res.correct} of {res.total}.
          </b>{' '}
          <button className="btn sm" type="button" onClick={() => void load(false)}>
            Play again
          </button>{' '}
          <button className="btn sm" type="button" onClick={() => void load(true)}>
            New game (uses today’s AI allowance)
          </button>
        </div>
      ) : (
        <button className="btn solid" type="button" onClick={submit} disabled={busy}>
          {busy ? <Spinner size={14} /> : null} Check my answers
        </button>
      )}
    </div>
  );
}
function OrderRound({
  n,
  r,
  value,
  onChange,
}: {
  n: number;
  r: Extract<GameRound, { type: 'order' }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const left = r.steps.filter((s) => !value.includes(s));
  return (
    <>
      <legend>
        {n + 1}. {r.prompt} <span className="small">Tap in order, first to last.</span>
      </legend>
      <ol className="learn-chosen">
        {value.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div className="row wrap-r" style={{ gap: 6 }}>
        {left.map((s) => (
          <button key={s} type="button" className="btn sm" onClick={() => onChange([...value, s])}>
            {s}
          </button>
        ))}
        {value.length ? (
          <button type="button" className="btn sm ghost" onClick={() => onChange([])}>
            Start over
          </button>
        ) : null}
      </div>
    </>
  );
}
function MatchRound({
  n,
  r,
  value,
  onChange,
}: {
  n: number;
  r: Extract<GameRound, { type: 'match' }>;
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  return (
    <>
      <legend>
        {n + 1}. {r.prompt}
      </legend>
      {r.left.map((l) => (
        <div key={l} className="row" style={{ gap: 8, margin: '4px 0' }}>
          <label htmlFor={`m-${n}-${l}`} style={{ minWidth: 100 }}>
            {l}
          </label>
          <select
            id={`m-${n}-${l}`}
            className="select"
            value={value[l] ?? ''}
            onChange={(e) => onChange({ ...value, [l]: e.target.value })}
          >
            <option value="">Choose…</option>
            {r.right.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
      ))}
    </>
  );
}

function Problems({ title }: { title: string }) {
  const [p, setP] = useState<ProblemsOut | null>(null);
  const [err, setErr] = useState<ApiFail | null>(null);
  const [val, setVal] = useState<Record<number, string>>({});
  const [out, setOut] = useState<
    Record<number, { ok: boolean; hint?: string; solution?: string; answer?: string | number }>
  >({});
  const load = useCallback(async () => {
    setErr(null);
    try {
      setP(await api<ProblemsOut>('/learn/problems', { body: { title } }));
    } catch (e) {
      setErr(e as ApiFail);
    }
  }, [title]);
  useEffect(() => {
    void load();
  }, [load]);
  const check = async (n: number, reveal = false) => {
    try {
      const r = await api<{ ok: boolean; hint?: string; solution?: string; answer?: string | number }>(
        '/learn/problems',
        { method: 'PUT', body: { title, index: n, value: val[n] ?? '', reveal } },
      );
      setOut((o) => ({ ...o, [n]: r }));
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    }
  };
  if (err) return <LimitNotice error={err} onRetry={() => void load()} />;
  if (!p)
    return (
      <div className="card row" role="status" style={{ gap: 12 }}>
        <Spinner size={18} />
        <span>Writing problems…</span>
      </div>
    );
  return (
    <div className="learn-problems">
      <section className="card">
        <h2 className="h3">Worked examples</h2>
        {p.worked.map((w) => (
          <div key={w.q}>
            <p>
              <b>{w.q}</b>
            </p>
            <ol>
              {w.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p>Answer: {w.answer}</p>
          </div>
        ))}
      </section>
      <section className="card">
        <h2 className="h3">Practice</h2>
        {p.practice.map((x, n) => (
          <div key={x.q} className="learn-q">
            <p>
              <b>{n + 1}.</b> {x.q}
            </p>
            <div className="row wrap-r" style={{ gap: 8 }}>
              <label className="sr-only" htmlFor={`pa-${n}`}>
                Answer to problem {n + 1}
              </label>
              <input
                id={`pa-${n}`}
                className="input"
                inputMode="decimal"
                value={val[n] ?? ''}
                placeholder={x.unit ? `Answer in ${x.unit}` : 'Your answer'}
                onChange={(e) => setVal((v) => ({ ...v, [n]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void check(n);
                }}
              />
              <button className="btn solid sm" type="button" onClick={() => void check(n)}>
                Check
              </button>
              <button className="btn sm" type="button" onClick={() => void check(n, true)}>
                Show solution
              </button>
            </div>
            {out[n] ? (
              <p role="status" className="small">
                {out[n].ok ? '✓ Correct. ' : out[n].solution ? '' : '✗ Not yet. '}
                {out[n].hint ?? ''}
                {out[n].solution ? ` Answer: ${out[n].answer}. ${out[n].solution}` : ''}
              </p>
            ) : null}
          </div>
        ))}
      </section>
    </div>
  );
}

function Ask({ title }: { title: string }) {
  const [msgs, setMsgs] = useState<{ role: string; text: string }[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiFail | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api<{ messages: { role: string; text: string }[] }>(`/learn/chat?title=${encodeURIComponent(title)}`)
      .then((r) => setMsgs(r.messages))
      .catch(() => null);
  }, [title]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs]);
  const send = async () => {
    const text = q.trim();
    if (busy || text.length < 3) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ answer: string }>('/learn/chat', { body: { title, question: text } });
      setMsgs((m) => [...m, { role: 'user', text }, { role: 'assistant', text: r.answer }]);
      setQ('');
    } catch (e) {
      setErr(e as ApiFail);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card learn-chat">
      <h2 className="h3">Ask the class</h2>
      <div className="learn-msgs" role="log" aria-live="polite" aria-label="Conversation">
        {!msgs.length ? (
          <p className="small">Ask anything about this lesson. Answers point to the slide they came from.</p>
        ) : null}
        {msgs.map((m, n) => (
          <p key={n} className={clsx('learn-msg', m.role)}>
            <b>{m.role === 'user' ? 'You' : 'Tutor'}:</b> {m.text}
          </p>
        ))}
        <div ref={end} />
      </div>
      {err ? <LimitNotice error={err} /> : null}
      <form
        className="row"
        style={{ gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="ask-q">
          Your question
        </label>
        <input
          id="ask-q"
          className="input"
          style={{ flex: 1 }}
          maxLength={500}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type your question"
        />
        <button className="btn solid" type="submit" disabled={busy || q.trim().length < 3}>
          {busy ? <Spinner size={14} /> : <Icon name="send" size={14} />} Ask
        </button>
      </form>
    </div>
  );
}
