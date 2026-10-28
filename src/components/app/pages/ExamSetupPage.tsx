'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { EmptyWorkspace } from '@/components/app/EmptyWorkspace';
import { LimitNotice } from '@/components/app/LimitNotice';
import { Icon, Spinner } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/controls';
import { useServerMe } from '@/hooks/useServerMe';
import { ApiFail } from '@/lib/api/client';
import { createExam, listExams, type ExamSummary } from '@/lib/api/exams';
import { useCourses } from '@/lib/store/hooks';
import { ago } from '@/lib/util';

type Kind = 'mcq' | 'short' | 'long';
type Diff = 'easy' | 'medium' | 'hard';
const KINDS: [Kind, string, string][] = [
  ['mcq', 'Multiple choice', '1 mark each, marked instantly'],
  ['short', 'Short answer', '2 to 5 marks, marked by AI'],
  ['long', 'Long answer', '6 to 10 marks, marked by AI'],
];

export function ExamSetupPage() {
  const cs = useCourses();
  const sp = useSearchParams();
  const router = useRouter();
  const { me } = useServerMe();
  const [cid, setCid] = useState(() => sp.get('course') ?? '');
  const c = cs.find((x) => x.id === cid) ?? cs[0];
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(30);
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(['mcq', 'short']));
  const [diff, setDiff] = useState<Diff>('medium');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiFail | null>(null);
  const [history, setHistory] = useState<ExamSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    listExams().then((h) => alive && setHistory(h)).catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => setPicked(new Set()), [c?.id]);

  const topics = useMemo(() => (c ? c.units.map((u) => [u, u.topics.map((id) => c.topics[id])] as const) : []), [c]);
  if (!cs.length)
    return (
      <div className="page">
        <div className="ph">
          <h1>Exam practice</h1>
        </div>
        <EmptyWorkspace />
      </div>
    );
  const chosen = picked.size ? [...picked] : c.order;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const e = await createExam({ courseId: c.id, topicIds: chosen, count, minutes, kinds: [...kinds], difficulty: diff });
      router.push(`/exam/${e.id}`);
    } catch (x) {
      setErr(x as ApiFail);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Practice</div>
          <h1 style={{ marginTop: 8 }}>Exam practice</h1>
          <p className="sub">Set your own paper, sit it in a timed exam window, and get it marked. Answer on screen or on paper.</p>
        </div>
        <div className="acts">
          <Link className="btn" href="/app/practice">
            Quick practice
          </Link>
        </div>
      </div>

      <div className="g21">
        <div className="card">
          <h2>1. What to examine</h2>
          {cs.length > 1 ? (
            <div className="field">
              <label htmlFor="ex-course">Subject</label>
              <select id="ex-course" className="select" value={c.id} onChange={(e) => setCid(e.target.value)}>
                {cs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small">{picked.size ? `${picked.size} topics chosen` : 'Everything in the subject (or pick topics)'}</span>
            <button className="btn xs" type="button" onClick={() => setPicked(new Set(c.order))}>
              Select all
            </button>
          </div>
          <div className="ex-topics">
            {topics.map(([u, ts]) => (
              <fieldset key={u.id}>
                <legend className="label">{u.title}</legend>
                {ts.map((t) => (
                  <label key={t.id} className="check">
                    <input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
                    {t.title}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>2. Shape the paper</h2>
          <div className="field">
            <label htmlFor="ex-count">{`Questions: ${count}`}</label>
            <input id="ex-count" type="range" min={5} max={30} step={1} value={count} onChange={(e) => { const n = +e.target.value; setCount(n); setMinutes(Math.max(10, Math.min(180, n * 3))); }} />
          </div>
          <div className="field">
            <label htmlFor="ex-min">{`Time: ${minutes} minutes`}</label>
            <input id="ex-min" type="range" min={10} max={180} step={5} value={minutes} onChange={(e) => setMinutes(+e.target.value)} />
          </div>
          <div className="field">
            <span className="label">Question types</span>
            {KINDS.map(([k, l, d]) => (
              <label key={k} className="check" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={kinds.has(k)} onChange={() => setKinds((s) => { const n = new Set(s); if (n.has(k) && n.size > 1) n.delete(k); else n.add(k); return n; })} />
                <span>{l}<br /><span className="small">{d}</span></span>
              </label>
            ))}
          </div>
          <div className="field">
            <span className="label">Difficulty</span>
            <Segmented<Diff> ariaLabel="Difficulty" value={diff} onChange={setDiff} options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
          </div>
          {err ? <LimitNotice error={err} /> : null}
          <button className="btn solid lg" type="button" disabled={busy} onClick={() => void start()}>
            {busy ? (<><Spinner size={15} /> Writing your paper…</>) : (<><Icon name="play" size={16} /> Start the exam</>)}
          </button>
          <p className="small">
            {me ? `Each paper uses one of your ${me.limits.examsPerDay ?? 'daily'} exam papers a day. ` : ''}Once you start, the timer runs. You can answer by typing, or by writing on paper and uploading photos of your pages.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Your exams</h2>
        {!history ? (
          <p className="small">Loading…</p>
        ) : history.length ? (
          <div className="list">
            {history.map((h) => (
              <Link key={h.id} className="li link" href={`/exam/${h.id}`}>
                <div className="grow">
                  <div className="t">{h.title}</div>
                  <div className="s">{`${h.courseTitle} · ${h.questions} questions · ${ago(h.created)}`}</div>
                </div>
                {h.status === 'marked' ? (
                  <span className={clsx('chip', (h.scored ?? 0) / h.totalMarks >= 0.5 ? 'green' : 'amber')}>{`${h.scored}/${h.totalMarks}`}</span>
                ) : (
                  <span className="chip">Not finished</span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="small">No exams yet. Your marked papers will be listed here.</p>
        )}
      </div>
    </div>
  );
}
