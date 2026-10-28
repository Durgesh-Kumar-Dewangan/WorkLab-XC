'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { downloadText, loadPack, packToHtml, savePack, type Pack } from '@/lib/offlinePack';
import { useApp } from '@/lib/store';
import { toast } from '@/lib/ui/toast';
import { apiErr } from './util';
import { Teach, Viva } from './Coach';
import { Papers, Scan } from './Inputs';

export interface MapRow {
  id: string;
  title: string;
  unit: string;
  mastery: number;
  seen: boolean;
  misses: number;
  sources: Record<string, number>;
  recent: { q: string; a: string; source: string }[];
  weak: number;
  likelihood: number;
  priority: number;
}
export interface Plan {
  examDate: string;
  minutes: number;
  daysLeft: number;
  missed: number;
  safeCount: number;
  skipped: { id: string; title: string; why: string }[];
  days: { date: string; today: boolean; items: { topicId: string; title: string; kind: string; weak: number; done: boolean }[] }[];
  today: { topicId: string; title: string; kind: string; done: boolean }[];
}
interface Card {
  id: string;
  title: string;
  front: string;
  back: string;
  source: string;
  interval: number;
}

const TABS = [
  ['today', 'Today'],
  ['weak', 'Weak spots'],
  ['cards', 'Cards'],
  ['teach', 'Teach it back'],
  ['viva', 'Viva'],
  ['papers', 'Past papers'],
  ['scan', 'Photo'],
  ['offline', 'Offline'],
] as const;
type Tab = (typeof TABS)[number][0];


/** The study coach: a plan to your exam, the weak-spot map, spaced cards, teach-back, viva, past papers, photo notes and an offline pack. */
export function StudyPage() {
  const q = useSearchParams();
  const router = useRouter();
  const courses = useApp((s) => s.courses);
  const tab = (TABS.find((t) => t[0] === q.get('tab'))?.[0] ?? 'today') as Tab;
  const [cid, setCid] = useState('');
  useEffect(() => {
    if (!courses.length) return;
    let saved = '';
    try {
      saved = localStorage.getItem('wlxc.study.course') || '';
    } catch {
      /* private mode */
    }
    setCid((cur) => cur || (courses.find((c) => c.id === saved) ? saved : courses[0].id));
  }, [courses]);
  const pick = (id: string) => {
    setCid(id);
    try {
      localStorage.setItem('wlxc.study.course', id);
    } catch {
      /* ignore */
    }
  };
  const go = (t: Tab) => router.replace(`/app/study?tab=${t}`);

  if (!courses.length)
    return (
      <div className="page">
        <div className="ph">
          <div>
            <div className="label">Study coach</div>
            <h1 style={{ marginTop: 8 }}>
              Know what to study <em>today</em>
            </h1>
            <p className="sub">Upload a syllabus first. The coach plans from your own topics.</p>
          </div>
          <Link className="btn solid" href="/app/upload">
            Upload a syllabus
          </Link>
        </div>
      </div>
    );

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Study coach</div>
          <h1 style={{ marginTop: 8 }}>
            Know what to study <em>today</em>
          </h1>
          <p className="sub">A plan to your exam, the topics you keep missing, and ways to practise them.</p>
        </div>
        <div className="acts">
          <select className="select" aria-label="Course" value={cid} onChange={(e) => pick(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="tabs st-pagetabs" role="tablist" aria-label="Study tools">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>
            {label}
          </button>
        ))}
      </div>
      {cid ? (
        <>
          {tab === 'today' ? <Today cid={cid} go={go} /> : null}
          {tab === 'weak' ? <Weak cid={cid} go={go} /> : null}
          {tab === 'cards' ? <Cards cid={cid} /> : null}
          {tab === 'teach' ? <Teach cid={cid} /> : null}
          {tab === 'viva' ? <Viva cid={cid} /> : null}
          {tab === 'papers' ? <Papers cid={cid} /> : null}
          {tab === 'scan' ? <Scan cid={cid} /> : null}
          {tab === 'offline' ? <Offline cid={cid} /> : null}
        </>
      ) : null}
    </div>
  );
}

function useLoad<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setErr('');
    } catch (e) {
      setErr((e as ApiFail).message || 'Could not load.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, err, load, setData };
}

const nice = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const plus = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- the exam countdown plan */
function Today({ cid, go }: { cid: string; go: (t: Tab) => void }) {
  const { data, err, load } = useLoad<{ plan: Plan | null; expired?: boolean }>(`/study/plan?courseId=${cid}`);
  const [date, setDate] = useState(plus(21));
  const [min, setMin] = useState(90);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api('/study/plan', { method: 'PUT', body: { courseId: cid, examDate: date, minutes: min } });
      await load();
    } catch (e) {
      apiErr(e);
    } finally {
      setBusy(false);
    }
  };
  if (err) return <p className="small">{err}</p>;
  if (!data) return <Spinner size={20} />;
  const plan = data.plan;
  if (!plan)
    return (
      <section className="card">
        <h2 className="h3">When is your exam?</h2>
        <p className="small">{data.expired ? 'That exam date has passed. Set the next one. ' : ''}Tell the coach the date and how long you can study each day. It builds a day-by-day plan from your syllabus and rebuilds it from your real progress, so a missed day just moves its topics forward.</p>
        <div className="st-form">
          <label className="field">
            <span className="label">Exam date</span>
            <input className="input" type="date" min={plus(1)} max={plus(365)} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Study time a day</span>
            <select className="select" value={min} onChange={(e) => setMin(Number(e.target.value))}>
              {[30, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`}
                </option>
              ))}
            </select>
          </label>
          <button className="btn solid" type="button" disabled={busy || !date} onClick={() => void save()}>
            Build my plan
          </button>
        </div>
      </section>
    );
  return (
    <>
      <section className="card st-hero">
        <div>
          <div className="label">{nice(plan.examDate)}</div>
          <h2 className="h2">
            {plan.daysLeft} day{plan.daysLeft === 1 ? '' : 's'} to your exam
          </h2>
          <p className="small">
            {plan.minutes} minutes a day · {plan.safeCount} topic{plan.safeCount === 1 ? '' : 's'} already strong enough to skip for now
          </p>
        </div>
        <button
          className="btn xs"
          type="button"
          onClick={async () => {
            await api(`/study/plan?courseId=${cid}`, { method: 'DELETE' }).catch(apiErr);
            await load();
          }}
        >
          Change date
        </button>
      </section>
      {plan.missed ? (
        <div className="callout">
          You missed {plan.missed} topic{plan.missed === 1 ? '' : 's'} from earlier days. They are moved forward in this plan.
        </div>
      ) : null}
      <section className="card">
        <h2 className="h3">Today</h2>
        {plan.today.length ? (
          <ul className="st-list2">
            {plan.today.map((it) => (
              <li key={it.topicId} className={it.done ? 'done' : ''}>
                <span className="st-tick" aria-hidden="true">
                  {it.done ? '✓' : ''}
                </span>
                <span className="grow">
                  <b>{it.title}</b> <em className="small">{it.kind === 'review' ? 'review' : 'learn'}</em>
                </span>
                <Link className="btn solid xs" href={`/app/courses/${cid}/topics/${it.topicId}`}>
                  {it.done ? 'Again' : 'Start'}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">Nothing is planned today. Use the time for your cards.</p>
        )}
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <button className="btn xs" type="button" onClick={() => go('cards')}>
            Review due cards
          </button>
          <button className="btn xs" type="button" onClick={() => go('weak')}>
            See weak spots
          </button>
        </div>
      </section>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="h3">The whole plan</h2>
          <button className="btn xs" type="button" onClick={() => setAll(!all)}>
            {all ? 'Hide' : 'Show all days'}
          </button>
        </div>
        {all ? (
          <ol className="st-days">
            {plan.days.map((d) => (
              <li key={d.date} className={d.today ? 'today' : ''}>
                <b>{nice(d.date)}</b>
                <span>{d.items.length ? d.items.map((i) => `${i.title}${i.kind === 'review' ? ' (review)' : ''}`).join(' · ') : 'Rest'}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {plan.skipped.length ? (
          <p className="small" style={{ marginTop: 10 }}>
            <b>Left out to fit your time:</b> {plan.skipped.map((s) => s.title).join(', ')}. {plan.skipped[0].why}.
          </p>
        ) : null}
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- the weak-spot map */
function Weak({ cid, go }: { cid: string; go: (t: Tab) => void }) {
  const { data, err } = useLoad<{ topics: MapRow[] }>(`/study/map?courseId=${cid}`);
  if (err) return <p className="small">{err}</p>;
  if (!data) return <Spinner size={20} />;
  const rows = [...data.topics].sort((a, b) => b.priority - a.priority);
  return (
    <section className="card">
      <h2 className="h3">Your weak spots</h2>
      <p className="small">Every wrong answer from drills, problems, games, exams, teach-back and viva lands here. The strongest glow is what to fix first; past papers raise the topics that are asked most.</p>
      <ul className="st-map">
        {rows.map((r) => (
          <li key={r.id} style={{ ['--w' as string]: r.weak }}>
            <div className="st-mh">
              <b>{r.title}</b>
              <span className="small">
                {r.seen ? `${Math.round(r.mastery * 100)}% strong` : 'not started'}
                {r.likelihood ? ` · exam likelihood ${Math.round(r.likelihood * 100)}%` : ''}
              </span>
            </div>
            <div className="st-bar">
              <i style={{ width: `${Math.round(r.weak * 100)}%` }} />
            </div>
            {r.misses ? (
              <div className="small">
                {r.misses} miss{r.misses === 1 ? '' : 'es'}: {Object.entries(r.sources).map(([k, v]) => `${k} ${v}`).join(', ')}
                {r.recent[0]?.q ? ` · “${r.recent[r.recent.length - 1].q.slice(0, 80)}”` : ''}
              </div>
            ) : null}
            <div className="row" style={{ gap: 6 }}>
              <Link className="btn xs" href={`/app/courses/${cid}/topics/${r.id}`}>
                Learn
              </Link>
              <button className="btn xs" type="button" onClick={() => go('teach')}>
                Teach it back
              </button>
              <button className="btn xs" type="button" onClick={() => go('viva')}>
                Viva
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- spaced cards */
function Cards({ cid }: { cid: string }) {
  const { data, err, load } = useLoad<{ cards: Card[]; due: number; total: number }>(`/study/cards?courseId=${cid}`);
  const [show, setShow] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [done, setDone] = useState(0);
  if (err) return <p className="small">{err}</p>;
  if (!data) return <Spinner size={20} />;
  const c = data.cards[0];
  const grade = async (g: 'again' | 'hard' | 'good' | 'easy') => {
    if (!c) return;
    try {
      await api(`/study/cards/${c.id}/review`, { body: { grade: g } });
      setShow(false);
      setDone((n) => n + 1);
      await load();
    } catch (e) {
      apiErr(e);
    }
  };
  return (
    <>
      <section className="card st-cardbox">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="h3">Cards to review</h2>
          <span className="small">
            {data.due} due · {data.total} in all{done ? ` · ${done} done now` : ''}
          </span>
        </div>
        {c ? (
          <div className="st-flash">
            <div className="small">{c.title}</div>
            <p className="st-front">{c.front}</p>
            {show ? <p className="st-back">{c.back}</p> : null}
            {!show ? (
              <button className="btn solid" type="button" onClick={() => setShow(true)}>
                Show the answer
              </button>
            ) : (
              <div className="st-grades">
                <button type="button" className="btn" onClick={() => void grade('again')}>
                  Again<small>10 min</small>
                </button>
                <button type="button" className="btn" onClick={() => void grade('hard')}>
                  Hard
                </button>
                <button type="button" className="btn solid" onClick={() => void grade('good')}>
                  Good
                </button>
                <button type="button" className="btn" onClick={() => void grade('easy')}>
                  Easy
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="small">{data.total ? 'All caught up. The next cards come back as they are due.' : 'No cards yet. Cards are made from your wrong answers, or add your own below.'}</p>
        )}
      </section>
      <section className="card">
        <h2 className="h3">Add a card</h2>
        <div className="st-form">
          <label className="field">
            <span className="label">Question</span>
            <input className="input" value={front} maxLength={400} onChange={(e) => setFront(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Answer</span>
            <input className="input" value={back} maxLength={600} onChange={(e) => setBack(e.target.value)} />
          </label>
          <button
            className="btn solid"
            type="button"
            disabled={front.trim().length < 4 || !back.trim()}
            onClick={async () => {
              try {
                await api('/study/cards', { body: { front, back, courseId: cid } });
                setFront('');
                setBack('');
                await load();
              } catch (e) {
                apiErr(e);
              }
            }}
          >
            Add
          </button>
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- offline pack */
function Offline({ cid }: { cid: string }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    void loadPack(cid).then(setPack);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [cid]);
  const download = async () => {
    setBusy(true);
    try {
      const p = await api<Pack>(`/study/pack?courseId=${cid}&days=${days}`);
      await savePack(p);
      setPack(p);
      if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      toast('Saved on this device.', 'ok');
    } catch (e) {
      apiErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="card">
        <h2 className="h3">Take it with you</h2>
        <p className="small">
          One tap saves the notes, practice questions and due cards for the next days of your plan on this device. {online ? '' : 'You are offline now; the saved pack below still opens. '}For the surest way to read with no signal, also save it as one file.
        </p>
        <div className="st-form">
          <label className="field">
            <span className="label">Days to pack</span>
            <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[3, 7, 14].map((d) => (
                <option key={d} value={d}>
                  Next {d} days
                </option>
              ))}
            </select>
          </label>
          <button className="btn solid" type="button" disabled={busy || !online} onClick={() => void download()}>
            {busy ? <Spinner size={14} /> : <Icon name="file" size={15} />} Save the pack
          </button>
          {pack ? (
            <button className="btn" type="button" onClick={() => downloadText(`${pack.courseTitle.replace(/[^a-z0-9]+/gi, '-')}-study-pack.html`, packToHtml(pack))}>
              Save as one file
            </button>
          ) : null}
        </div>
      </section>
      {pack ? (
        <section className="card">
          <h2 className="h3">{pack.courseTitle}</h2>
          <p className="small">
            Saved {new Date(pack.generated).toLocaleString()} · {pack.topics.length} topics · {pack.cards.length} cards
          </p>
          <ul className="st-list2">
            {pack.topics.map((t) => (
              <li key={t.id}>
                <span className="grow">
                  <b>{t.title}</b> <em className="small">{t.drill.length} practice questions</em>
                </span>
                <button className="btn xs" type="button" onClick={() => setOpen(open === t.id ? null : t.id)}>
                  {open === t.id ? 'Close' : 'Read'}
                </button>
                {open === t.id ? (
                  <div className="st-read">
                    <pre>{t.material}</pre>
                    {t.notes ? <pre>{t.notes}</pre> : null}
                    {t.drill.map((d, i) => (
                      <details key={i}>
                        <summary>{d.prompt}</summary>
                        <ol type="A">
                          {d.options.map((o) => (
                            <li key={o}>{o}</li>
                          ))}
                        </ol>
                        <p>
                          <b>Answer {'ABCD'[d.answer]}.</b> {d.why}
                        </p>
                      </details>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
