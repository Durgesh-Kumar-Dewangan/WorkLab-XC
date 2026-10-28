'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Icon, Spinner } from '@/components/ui/Icon';
import { LimitNotice } from '@/components/app/LimitNotice';
import { ApiFail } from '@/lib/api/client';
import { getExam, shrinkPhoto, submitExam, submitSheet, type Exam, type TypedAnswer } from '@/lib/api/exams';
import { confirmBox } from '@/lib/ui/modal';

type Mode = 'typed' | 'sheet';
interface Ans {
  choice?: number;
  text?: string;
}

const clock = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const LETTER = (i: number) => String.fromCharCode(65 + i);

/** The exam window: a timer, one question per page, a navigator, and either typed answers or a photographed handwritten sheet. */
export function ExamWindow({ id }: { id: string }) {
  const [exam, setExam] = useState<Exam | null>(null);
  const [err, setErr] = useState<ApiFail | null>(null);
  const [mode, setMode] = useState<Mode>('typed');
  const [i, setI] = useState(0);
  const [ans, setAns] = useState<Record<number, Ans>>({});
  const [flag, setFlag] = useState<Set<number>>(new Set());
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [pages, setPages] = useState<{ blob: Blob; url: string }[]>([]);
  const startedAt = useRef(0);
  const submitted = useRef(false);

  useEffect(() => {
    let alive = true;
    getExam(id)
      .then((e) => {
        if (!alive) return;
        setExam(e);
        if (e.status === 'open') {
          const k = `wlxc.exam.${id}`;
          let t0 = 0;
          try {
            t0 = Number(sessionStorage.getItem(k)) || 0;
            if (!t0) sessionStorage.setItem(k, String((t0 = Date.now())));
            const saved = sessionStorage.getItem(`${k}.ans`);
            if (saved) setAns(JSON.parse(saved));
          } catch {
            t0 = Date.now();
          }
          startedAt.current = t0 || Date.now();
        }
      })
      .catch((e) => alive && setErr(e as ApiFail));
    return () => {
      alive = false;
    };
  }, [id]);

  // answers survive an accidental refresh
  useEffect(() => {
    if (!exam || exam.status !== 'open') return;
    try {
      sessionStorage.setItem(`wlxc.exam.${id}.ans`, JSON.stringify(ans));
    } catch {
      /* storage blocked */
    }
  }, [ans, exam, id]);

  const finish = useCallback(
    async (auto = false) => {
      if (!exam || submitted.current) return;
      submitted.current = true;
      setBusy(auto ? 'Time is up. Marking your answers…' : 'Marking your answers…');
      const answers: TypedAnswer[] = exam.questions.map((_, k) => ({ i: k, choice: ans[k]?.choice, text: ans[k]?.text }));
      try {
        const done = await submitExam(id, answers, Math.round((Date.now() - startedAt.current) / 1000));
        setExam(done);
        setBusy('');
      } catch (e) {
        submitted.current = false;
        setBusy('');
        setErr(e as ApiFail);
      }
    },
    [exam, ans, id],
  );

  // the countdown, from the moment the exam was opened
  useEffect(() => {
    if (!exam || exam.status !== 'open') return;
    const tick = () => {
      const s = Math.max(0, exam.minutes * 60 - Math.floor((Date.now() - startedAt.current) / 1000));
      setLeft(s);
      if (s === 0 && mode === 'typed') void finish(true);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [exam, mode, finish]);

  const sendSheet = async () => {
    if (!pages.length) return;
    submitted.current = true;
    setBusy('Reading your handwriting and marking it. This can take up to a minute…');
    try {
      setExam(await submitSheet(id, pages.map((p) => p.blob)));
      setBusy('');
    } catch (e) {
      submitted.current = false;
      setBusy('');
      setErr(e as ApiFail);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const next: { blob: Blob; url: string }[] = [];
    for (const f of Array.from(files).slice(0, 8 - pages.length)) {
      try {
        const blob = await shrinkPhoto(f);
        next.push({ blob, url: URL.createObjectURL(blob) });
      } catch {
        /* skip a file that is not a readable image */
      }
    }
    setPages((p) => [...p, ...next].slice(0, 8));
  };

  const answered = useMemo(() => (exam ? exam.questions.filter((q, k) => (q.type === 'mcq' ? ans[k]?.choice !== undefined : !!ans[k]?.text?.trim())).length : 0), [exam, ans]);

  if (err && !exam)
    return (
      <div className="ex-center">
        <LimitNotice error={err} />
        <Link className="btn" href="/app/practice/exam">
          Back to exams
        </Link>
      </div>
    );
  if (!exam)
    return (
      <div className="ex-center" role="status">
        <Spinner size={22} />
      </div>
    );
  if (exam.status === 'marked' && exam.result) return <Results exam={exam} />;

  const q = exam.questions[i];
  const low = left !== null && left <= 300;
  const nav = (
    <div className="ex-nav" role="group" aria-label="Questions">
      {exam.questions.map((qq, k) => {
        const done = qq.type === 'mcq' ? ans[k]?.choice !== undefined : !!ans[k]?.text?.trim();
        return (
          <button key={k} type="button" className={clsx(k === i && 'cur', done && 'done', flag.has(k) && 'flag')} aria-label={`Question ${k + 1}${done ? ', answered' : ''}${flag.has(k) ? ', flagged' : ''}`} aria-current={k === i ? 'true' : undefined} onClick={() => setI(k)}>
            {k + 1}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="ex">
      <header className="ex-top">
        <div className="ex-title">
          <span className="label">{exam.courseTitle}</span>
          <b>{exam.title}</b>
        </div>
        <div className="grow" />
        <div className={clsx('ex-timer', low && 'low')} role="timer" aria-label="Time left">
          <Icon name="clock" size={16} />
          {left === null ? '--:--' : clock(left)}
        </div>
        <button className="btn solid sm" type="button" disabled={!!busy} onClick={async () => {
          if (mode === 'sheet') return void (pages.length ? sendSheet() : undefined);
          const un = exam.questions.length - answered;
          if (await confirmBox({ title: 'Submit your exam?', body: un ? `${un} question${un === 1 ? ' is' : 's are'} unanswered. You cannot change your answers after submitting.` : 'You cannot change your answers after submitting.', confirmLabel: 'Submit and mark' })) void finish();
        }}>
          {mode === 'sheet' ? 'Submit sheet' : 'Submit'}
        </button>
      </header>

      <div className="ex-modes" role="tablist" aria-label="How you will answer">
        <button type="button" role="tab" aria-selected={mode === 'typed'} onClick={() => setMode('typed')}>
          <Icon name="edit" size={15} /> Type my answers
        </button>
        <button type="button" role="tab" aria-selected={mode === 'sheet'} onClick={() => setMode('sheet')}>
          <Icon name="upload" size={15} /> Write on paper and upload
        </button>
      </div>

      {err ? (
        <div className="ex-err">
          <LimitNotice error={err} />
        </div>
      ) : null}

      {busy ? (
        <div className="ex-center" role="status" aria-live="polite">
          <Spinner size={24} />
          <p className="body">{busy}</p>
        </div>
      ) : mode === 'typed' ? (
        <div className="ex-body">
          <aside className="ex-side">
            <div className="label">Questions</div>
            {nav}
            <p className="small">{`${answered} of ${exam.questions.length} answered`}</p>
            <div className="ex-key small">
              <span><i className="done" /> Answered</span>
              <span><i className="flag" /> Flagged</span>
            </div>
          </aside>
          <main className="ex-main">
            <div className="ex-qhead">
              <span className="label">{`Question ${i + 1} of ${exam.questions.length}`}</span>
              <span className="chip">{`${q.marks} mark${q.marks === 1 ? '' : 's'}`}</span>
            </div>
            <h2 className="ex-q">{q.q}</h2>
            {q.type === 'mcq' ? (
              <div className="ex-opts" role="radiogroup" aria-label="Choose one answer">
                {q.options!.map((o, k) => (
                  <button key={k} type="button" role="radio" aria-checked={ans[i]?.choice === k} className={clsx('ex-opt', ans[i]?.choice === k && 'on')} onClick={() => setAns((a) => ({ ...a, [i]: { ...a[i], choice: k } }))}>
                    <b>{LETTER(k)}</b>
                    <span>{o}</span>
                  </button>
                ))}
                {ans[i]?.choice !== undefined ? (
                  <button className="btn xs ghost" type="button" onClick={() => setAns((a) => ({ ...a, [i]: {} }))}>
                    Clear my choice
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <textarea
                  className="textarea ex-text"
                  rows={q.type === 'long' ? 14 : 8}
                  aria-label="Your answer"
                  placeholder={q.type === 'long' ? 'Write a full answer. Show your reasoning and any working.' : 'Write a short answer.'}
                  value={ans[i]?.text ?? ''}
                  onChange={(e) => setAns((a) => ({ ...a, [i]: { ...a[i], text: e.target.value } }))}
                />
                <span className="small">{`${(ans[i]?.text ?? '').trim().split(/\s+/).filter(Boolean).length} words`}</span>
              </>
            )}
            <div className="ex-foot">
              <button className="btn" type="button" disabled={i === 0} onClick={() => setI(i - 1)}>
                <Icon name="arrow-l" size={15} /> Previous
              </button>
              <button className={clsx('btn', flag.has(i) && 'solid')} type="button" aria-pressed={flag.has(i)} onClick={() => setFlag((f) => { const n = new Set(f); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                <Icon name="star" size={15} /> {flag.has(i) ? 'Flagged' : 'Flag for review'}
              </button>
              <button className="btn solid" type="button" disabled={i === exam.questions.length - 1} onClick={() => setI(i + 1)}>
                Next <Icon name="arrow-r" size={15} />
              </button>
            </div>
          </main>
        </div>
      ) : (
        <div className="ex-sheet">
          <div className="card">
            <h2>Answer on paper</h2>
            <ol className="ex-steps">
              <li>Write your answers on paper and put the question number beside each one (Q1, Q2…). For multiple choice, write the letter.</li>
              <li>Take a clear, flat, well-lit photo of every page. Keep writing dark and the page in frame.</li>
              <li>Add the photos below (up to 8 pages) and submit. The AI reads your handwriting and marks it.</li>
            </ol>
            <label className="btn solid" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
              <Icon name="upload" size={16} /> Add photos
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" className="sr" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
            {pages.length ? (
              <div className="ex-pages">
                {pages.map((p, k) => (
                  <figure key={p.url}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`Page ${k + 1} of your answer sheet`} />
                    <figcaption>
                      <span>{`Page ${k + 1}`}</span>
                      <button type="button" className="btn xs" onClick={() => setPages((a) => a.filter((_, j) => j !== k))}>
                        Remove
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
            <button className="btn solid lg" type="button" disabled={!pages.length} onClick={() => void sendSheet()}>
              Submit sheet for marking
            </button>
          </div>
          <div className="card">
            <h2>The question paper</h2>
            <ol className="ex-paper">
              {exam.questions.map((qq, k) => (
                <li key={k}>
                  <b>{`Q${k + 1}.`}</b> {qq.q} <span className="small">{`[${qq.marks} mark${qq.marks === 1 ? '' : 's'}]`}</span>
                  {qq.options ? (
                    <ul>
                      {qq.options.map((o, m) => (
                        <li key={m}>{`${LETTER(m)}. ${o}`}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
            <button className="btn" type="button" onClick={() => window.print()}>
              Print the paper
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Results({ exam }: { exam: Exam }) {
  const r = exam.result!;
  const weak = exam.questions.map((q, k) => ({ q, k, p: r.perQuestion[k] })).filter((x) => x.p && x.p.marks < x.p.max / 2);
  const col = r.percent >= 75 ? 'var(--green)' : r.percent >= 50 ? 'var(--amber)' : 'var(--red)';
  const c = 2 * Math.PI * 54;
  return (
    <div className="ex ex-result">
      <header className="ex-top">
        <div className="ex-title">
          <span className="label">{exam.courseTitle}</span>
          <b>{exam.title}</b>
        </div>
        <div className="grow" />
        <Link className="btn sm" href="/app/practice/exam">
          Back to exams
        </Link>
      </header>
      <div className="ex-resbody">
        <div className="card ex-score">
          <svg viewBox="0 0 120 120" width={140} height={140} role="img" aria-label={`${r.percent} percent`}>
            <circle cx={60} cy={60} r={54} fill="none" stroke="var(--line2)" strokeWidth={10} />
            <circle cx={60} cy={60} r={54} fill="none" stroke={col} strokeWidth={10} strokeLinecap="round" strokeDasharray={`${(c * r.percent) / 100} ${c}`} transform="rotate(-90 60 60)" />
            <text x={60} y={66} textAnchor="middle" fontSize={26} fontWeight={600} fill="var(--fg)">{`${r.percent}%`}</text>
          </svg>
          <div>
            <h1 className="h2">{`${r.scored} out of ${r.total} marks`}</h1>
            <p className="body">
              {r.mode === 'sheet' ? 'Marked from your handwritten sheet.' : r.seconds ? `Finished in ${clock(r.seconds)} of ${exam.minutes} minutes.` : ''}
            </p>
            {r.legibility === 'poor' ? <p className="small bad">The handwriting was hard to read, so some marks may be missing. A clearer photo would help.</p> : null}
            {r.note ? <p className="small">{r.note}</p> : null}
            <p className="small">Marks for written answers are set by AI and are a guide for your practice, not an official grade. If a mark looks wrong, compare your answer with the model answer below.</p>
          </div>
        </div>
        {weak.length ? (
          <div className="callout">
            <Icon name="target" size={18} />
            <span>{`You lost most marks on ${weak.map((w) => `Q${w.k + 1}`).join(', ')}. Review those answers below, then practise the topics again.`}</span>
          </div>
        ) : null}
        <div className="card">
          <h2>Question by question</h2>
          <div className="list">
            {exam.questions.map((q, k) => {
              const p = r.perQuestion[k];
              return (
                <details className="ex-rev" key={k} open={p.marks < p.max}>
                  <summary>
                    <span className={clsx('ex-mk', p.marks >= p.max ? 'ok' : p.marks > 0 ? 'part' : 'no')}>{`${p.marks}/${p.max}`}</span>
                    <span>{`Q${k + 1}. ${q.q}`}</span>
                  </summary>
                  <div className="ex-revbody">
                    {q.type === 'mcq' ? (
                      <>
                        <p className="small">{`Your answer: ${p.choice !== null && p.choice !== undefined && q.options ? `${LETTER(p.choice)}. ${q.options[p.choice]}` : 'none'}`}</p>
                        <p className="small">{`Correct answer: ${q.options && q.answer !== undefined ? `${LETTER(q.answer)}. ${q.options[q.answer]}` : ''}`}</p>
                        {q.why ? <p className="body">{q.why}</p> : null}
                      </>
                    ) : (
                      <>
                        <p className="small">Your answer</p>
                        <p className="body">{p.answer || 'No answer given.'}</p>
                        {p.feedback ? <p className="body"><b>Examiner: </b>{p.feedback}</p> : null}
                        <p className="small">Model answer</p>
                        <p className="body">{q.modelAnswer}</p>
                      </>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
        <div className="row wrap-r">
          <Link className="btn solid" href="/app/practice/exam">
            New exam
          </Link>
          <Link className="btn" href={`/app/courses/${exam.courseId}`}>
            Back to the course
          </Link>
        </div>
      </div>
    </div>
  );
}
