'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, Spinner } from '@/components/ui/Icon';
import { LimitNotice } from '@/components/app/LimitNotice';
import { api, ApiFail, hasBackend } from '@/lib/api/client';
import type { CourseProgress, CourseTopic } from '@/lib/learn';
import { toast } from '@/lib/ui/toast';
import { useApp } from '@/lib/store';
import { PathStylePicker } from '@/components/app/PathStylePicker';
import { DepthPicker } from '@/components/app/DepthPicker';

interface CourseRow {
  id: string;
  title: string;
  topics: number;
}
interface CourseFull {
  id: string;
  course: {
    title: string;
    units: { id: string; title: string; topics: string[] }[];
    topics: Record<string, { title: string }>;
  };
}
interface Addon {
  currency?: { symbol: string };
  catalogue: {
    sku: string;
    name: string;
    description: string;
    priceInr: number | null;
    listPriceInr?: number;
    saveInr?: number;
    savePct?: number;
  }[];
  free?: { chat: [number, number]; notes: [number, number] };
  mine: { sku: string; quantity: number; validUntil: number | null }[];
}
interface Saved {
  version: number;
  markdown: string;
  title: string;
  updated: number;
}

const href = (course: string, courseId: string, t: { id: string; title: string }) =>
  `/app/learn/session?title=${encodeURIComponent(t.title)}&courseId=${courseId}&topicId=${t.id}&course=${encodeURIComponent(course)}`;

interface Loaded {
  full: CourseFull;
  prog: CourseProgress;
}

/** Every subject side by side as its own learning path, plus the unit tools and add-ons. */
export function LearnPage() {
  const [pick, setPick] = useState(() => {
    try {
      return localStorage.getItem('wlxc.learn.course') || '';
    } catch {
      return '';
    }
  });
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [data, setData] = useState<Record<string, Loaded>>({});
  const [err, setErr] = useState<ApiFail | null>(null);

  useEffect(() => {
    if (!hasBackend()) return;
    let alive = true;
    api<{ courses: CourseRow[] }>('/courses')
      .then((r) => {
        if (!alive) return;
        setCourses(r.courses);
        r.courses.forEach((c) =>
          Promise.all([
            api<CourseFull>(`/courses/${c.id}`),
            api<CourseProgress>(`/learn/progress?courseId=${c.id}`),
          ])
            .then(([full, prog]) => alive && setData((d) => ({ ...d, [c.id]: { full, prog } })))
            .catch((e) => alive && setErr(e as ApiFail)),
        );
      })
      .catch((e) => alive && setErr(e as ApiFail));
    return () => {
      alive = false;
    };
  }, []);

  if (!hasBackend())
    return (
      <div className="page">
        <div className="ph">
          <h1>Learn</h1>
        </div>
        <div className="callout">
          <Icon name="info" size={18} />
          <span>Learning sessions need the WorkLab XC server.</span>
        </div>
      </div>
    );

  const loaded = (courses ?? []).filter((c) => data[c.id]);
  const shown = loaded.find((c) => c.id === pick) ?? loaded[0];
  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Learn</div>
          <h1 style={{ marginTop: 8 }}>Your learning paths</h1>
          <p className="sub">
            Every subject has its own path. Work through it one topic at a time, and finish a topic to unlock
            the next.
          </p>
        </div>
      </div>
      {err ? <LimitNotice error={err} /> : null}
      {courses && !courses.length ? (
        <div className="card">
          <h2 className="h3">No course yet</h2>
          <p className="body">Upload a syllabus and we will turn it into topics you can learn one by one.</p>
          <Link className="btn solid" href="/app/upload">
            Upload a syllabus
          </Link>
        </div>
      ) : null}
      {courses?.length && loaded.length < courses.length && !err ? (
        <div className="card row" role="status" style={{ gap: 12 }}>
          <Spinner size={18} />
          <span>Loading your subjects…</span>
        </div>
      ) : null}
      {loaded.length ? (
        <div className="lp-bar">
          <DepthPicker compact />
          <PathStylePicker compact />
        </div>
      ) : null}
      {loaded.length > 1 ? (
        <div className="lp-tabs" role="tablist" aria-label="Subjects">
          {loaded.map((c) => {
            const { full, prog } = data[c.id];
            const total = prog.topics?.length ?? 0;
            const done = (prog.topics ?? []).filter((t) => t.seen && t.mastery >= 0.6).length;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={shown?.id === c.id}
                className={shown?.id === c.id ? 'on' : ''}
                onClick={() => {
                  setPick(c.id);
                  try {
                    localStorage.setItem('wlxc.learn.course', c.id);
                  } catch {
                    /* private mode */
                  }
                }}
              >
                <b>{full.course.title}</b>
                <small>{`${done}/${total} done`}</small>
              </button>
            );
          })}
        </div>
      ) : null}
      {shown ? (
        <div className="lp-one">
          {(() => {
            const { full, prog } = data[shown.id];
            const mastery = new Map<string, CourseTopic>(
              (prog.topics ?? []).map((t) => [t.id, t] as [string, CourseTopic]),
            );
            return (
              <Roadmap key={shown.id} full={full} mastery={mastery} next={prog.next} reason={prog.reason} />
            );
          })()}
        </div>
      ) : null}
      {loaded.length ? (
        <details className="card rm-tools">
          <summary>Unit tools: full answers and notes by marks</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 14 }}>
            {loaded.map((c) => {
              const { full, prog } = data[c.id];
              const mastery = new Map<string, CourseTopic>(
                (prog.topics ?? []).map((t) => [t.id, t] as [string, CourseTopic]),
              );
              return (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <h3 className="h3">{full.course.title}</h3>
                  {full.course.units.map((u) => (
                    <UnitCard
                      key={u.id}
                      courseId={full.id}
                      courseTitle={full.course.title}
                      unit={u}
                      topics={u.topics.map((id) => ({
                        id,
                        title: full.course.topics[id]?.title ?? id,
                        m: mastery.get(id)?.mastery ?? 0,
                        seen: mastery.get(id)?.seen ?? false,
                      }))}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </details>
      ) : null}
      <Addons />
    </div>
  );
}

function UnitCard({
  courseId,
  courseTitle,
  unit,
  topics,
}: {
  courseId: string;
  courseTitle: string;
  unit: { id: string; title: string };
  topics: { id: string; title: string; m: number; seen: boolean }[];
}) {
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [notes, setNotes] = useState<Saved | null>(null);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<ApiFail | null>(null);
  useEffect(() => {
    const q = `courseId=${courseId}&unitId=${unit.id}`;
    api<{ saved: Saved | null }>(`/learn/unit-answers?${q}`)
      .then((r) => setSaved(r.saved))
      .catch(() => null);
    api<{ saved: Saved | null }>(`/learn/notes?${q}`)
      .then((r) => setNotes(r.saved))
      .catch(() => null);
  }, [courseId, unit.id]);
  const gen = async () => {
    setBusy('answers');
    setErr(null);
    try {
      setSaved(await api<Saved>('/learn/unit-answers', { body: { courseId, unitId: unit.id } }));
      toast('Full answers saved.', 'ok');
    } catch (e) {
      setErr(e as ApiFail);
    } finally {
      setBusy('');
    }
  };
  const makeNotes = async () => {
    setBusy('notes');
    setErr(null);
    try {
      const weights = topics.filter((t) => marks[t.id]).map((t) => ({ topic: t.title, marks: marks[t.id] }));
      setNotes(await api<Saved>('/learn/notes', { body: { courseId, unitId: unit.id, weights } }));
      setOpen(false);
      toast('Notes saved.', 'ok');
    } catch (e) {
      setErr(e as ApiFail);
    } finally {
      setBusy('');
    }
  };
  const dl = (kind: 'unit-answers' | 'notes') =>
    `/api/learn/${kind}?courseId=${courseId}&unitId=${unit.id}&format=md`;
  return (
    <section className="card" aria-label={unit.title}>
      <h2 className="h3">{unit.title}</h2>
      <ul className="learn-topics">
        {topics.map((t) => (
          <li key={t.id}>
            <Link href={href(courseTitle, courseId, t)}>{t.title}</Link>
            <span
              className="learn-bar"
              role="img"
              aria-label={t.seen ? `Mastery ${Math.round(t.m * 100)} percent` : 'Not started'}
            >
              <i style={{ width: `${Math.round(t.m * 100)}%` }} />
            </span>
            <span className="small">{t.seen ? `${Math.round(t.m * 100)}%` : 'New'}</span>
          </li>
        ))}
      </ul>
      <div className="row wrap-r" style={{ gap: 8 }}>
        <button className="btn sm" type="button" disabled={!!busy} onClick={() => void gen()}>
          {busy === 'answers' ? <Spinner size={14} /> : <Icon name="file-text" size={14} />}{' '}
          {saved ? 'Write new full answers' : 'Generate full answers'}
        </button>
        {saved ? (
          <a className="btn sm" href={dl('unit-answers')}>
            Download v{saved.version}
          </a>
        ) : null}
        <button className="btn sm" type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="target" size={14} /> Notes by marks
        </button>
        {notes ? (
          <a className="btn sm" href={dl('notes')}>
            Download notes v{notes.version}
          </a>
        ) : null}
      </div>
      {open ? (
        <fieldset className="learn-q">
          <legend>Marks for each topic (leave blank to skip)</legend>
          {topics.map((t) => (
            <div key={t.id} className="row" style={{ gap: 8, margin: '4px 0' }}>
              <label htmlFor={`mk-${unit.id}-${t.id}`} style={{ flex: 1 }}>
                {t.title}
              </label>
              <input
                id={`mk-${unit.id}-${t.id}`}
                className="input"
                style={{ width: 80 }}
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                value={marks[t.id] ?? ''}
                onChange={(e) => setMarks((m) => ({ ...m, [t.id]: Number(e.target.value) }))}
              />
            </div>
          ))}
          <button
            className="btn solid sm"
            type="button"
            disabled={!!busy || !Object.values(marks).some(Boolean)}
            onClick={() => void makeNotes()}
          >
            {busy === 'notes' ? <Spinner size={14} /> : null} Make my notes
          </button>
        </fieldset>
      ) : null}
      {err ? <LimitNotice error={err} /> : null}
    </section>
  );
}

function Addons() {
  const [a, setA] = useState<Addon | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    api<Addon>('/addons')
      .then(setA)
      .catch(() => null);
  }, []);
  if (!a) return null;
  const buy = async (sku: string) => {
    setBusy(sku);
    try {
      const r = await api<{ url: string }>('/addons', { body: { sku } });
      window.location.href = r.url;
    } catch (e) {
      toast((e as ApiFail).message, 'err');
      setBusy('');
    }
  };
  return (
    <section className="card" id="addons" aria-labelledby="ad-h">
      <h2 className="h3" id="ad-h">
        Add-ons
      </h2>
      {a.free ? (
        <p className="small">{`Every account includes ${a.free.chat[1]} tutor questions and ${a.free.notes[1]} unit notes a month. This month you have used ${a.free.chat[0]} and ${a.free.notes[0]}.`}</p>
      ) : null}
      <div className="learn-addons">
        {a.catalogue.map((c) => {
          const mine = a.mine.find((m) => m.sku === c.sku);
          return (
            <div key={c.sku} className="learn-addon">
              <b>{c.name}</b>
              {c.savePct ? <em className="navtag">{`Save ${c.savePct}%`}</em> : null}
              <p className="small">{c.description}</p>
              {c.listPriceInr ? (
                <p className="small">{`Bought separately ${a.currency?.symbol ?? '₹'}${c.listPriceInr}. Together ${a.currency?.symbol ?? '₹'}${c.priceInr}, you save ${a.currency?.symbol ?? '₹'}${c.saveInr}.`}</p>
              ) : null}
              {mine ? (
                <p className="small">
                  {c.sku === 'chatbot' || c.sku === 'monthly_notes'
                    ? `Active${mine.validUntil ? ` until ${new Date(mine.validUntil).toLocaleDateString()}` : ''}`
                    : `${mine.quantity} left${mine.validUntil ? ` · until ${new Date(mine.validUntil).toLocaleDateString()}` : ''}`}
                </p>
              ) : null}
              <button
                className="btn sm"
                type="button"
                disabled={!c.priceInr || busy === c.sku}
                onClick={() => void buy(c.sku)}
              >
                {c.priceInr ? `Buy · ${a.currency?.symbol ?? '₹'}${c.priceInr}` : 'Not available yet'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const COLORS = ['#2f7bff', '#7c4dff', '#d46bff', '#12a150', '#e58a00', '#e5484d'];
/** A topic counts as complete once it has been studied and the learner's answers put it at 60% or more. */
const complete = (t?: CourseTopic) => !!t && t.seen && t.mastery >= 0.6;

/**
 * The learning path: units are sections, topics are nodes along a winding road. Topics are a queue. Only the first
 * unfinished topic is open; everything after it is locked until it is complete.
 */
/** A curved dotted trail drawn through the centres of the nodes, measured from the page so it always meets them. */
function TrailLine({ host }: { host: React.RefObject<HTMLOListElement | null> }) {
  const [d, setD] = useState('');
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const ol = host.current;
    if (!ol) return;
    const draw = () => {
      const base = ol.getBoundingClientRect();
      const pts = [...ol.querySelectorAll<HTMLElement>('.lp-node')].map((n) => {
        const r = n.getBoundingClientRect();
        return [r.left - base.left + r.width / 2, r.top - base.top + r.height / 2] as const;
      });
      if (pts.length < 2) return setD('');
      let path = `M ${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const my = (y0 + y1) / 2;
        path += ` C ${x0} ${my}, ${x1} ${my}, ${x1} ${y1}`;
      }
      setD(path);
      setBox({ w: base.width, h: base.height });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(ol);
    return () => ro.disconnect();
  }, [host]);
  return (
    <svg className="lp-line" width={box.w} height={box.h} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Unit({
  children,
}: {
  children: (host: React.RefObject<HTMLOListElement | null>) => React.ReactNode;
}) {
  const host = useRef<HTMLOListElement | null>(null);
  return <>{children(host)}</>;
}

function Roadmap({
  full,
  mastery,
  next,
  reason,
}: {
  full: CourseFull;
  mastery: Map<string, CourseTopic>;
  next: CourseTopic | null;
  reason: string;
}) {
  const style = useApp((s) => s.settings.pathStyle) ?? 'classic';
  const flat = full.course.units.flatMap((u) => u.topics);
  const firstOpen = flat.findIndex((id) => !complete(mastery.get(id)));
  const doneCount = flat.filter((id) => complete(mastery.get(id))).length;
  const [sel, setSel] = useState<string | null>(null);
  // where each unit starts in the whole path, worked out before drawing so a repeated render cannot shift the numbers
  const starts = full.course.units.reduce<number[]>(
    (acc, u, i) => [...acc, (acc[i - 1] ?? 0) + (i ? full.course.units[i - 1].topics.length : 0)],
    [],
  );
  const pct = flat.length ? Math.round((doneCount / flat.length) * 100) : 0;
  // the trail sways left and right, as a share of the column width, so it fits wide and narrow columns alike
  const SWAY = [0, 15, 24, 15, 0, -15, -24, -15];
  return (
    <section aria-label={`Learning path: ${full.course.title}`} className="lp" data-path={style}>
      <header className="lp-head">
        <div
          className="lp-ring"
          style={{ '--p': pct } as React.CSSProperties}
          role="img"
          aria-label={`${pct} percent complete`}
        >
          <b>{pct}%</b>
        </div>
        <div className="lp-hcopy">
          <span className="label">{full.course.title}</span>
          <h2>{`${doneCount} of ${flat.length} topics complete`}</h2>
          {next ? (
            <p className="small">{`Up next: ${next.title}`}</p>
          ) : (
            <p className="small">Add topics to your course to start your path.</p>
          )}
        </div>
        <div className="lp-hact">
          {next ? (
            <Link className="btn solid" href={href(full.course.title, full.id, next)}>
              <Icon name="play" size={15} /> Continue
            </Link>
          ) : null}
        </div>
      </header>
      {full.course.units.map((u, ui) => {
        const color = COLORS[ui % COLORS.length];
        const unitDone = u.topics.filter((x) => complete(mastery.get(x))).length;
        const finished = unitDone === u.topics.length && u.topics.length > 0;
        const numbered = /^unit\b/i.test(u.title);
        return (
          <div key={u.id} className="lp-unit" style={{ '--c': color } as React.CSSProperties}>
            <div className="lp-banner">
              <span className="lp-bn">{ui + 1}</span>
              <div className="lp-bt">
                {numbered ? null : <span className="label">{`Unit ${ui + 1}`}</span>}
                <b>{u.title}</b>
              </div>
              <span
                className="lp-bc"
                aria-label={`${unitDone} of ${u.topics.length} complete`}
              >{`${unitDone}/${u.topics.length}`}</span>
            </div>
            <Unit>
              {(host) => (
                <ol className="lp-trail" ref={host}>
                  <TrailLine host={host} />
                  {u.topics.map((id, k) => {
                    const idx = starts[ui] + k;
                    const t = mastery.get(id);
                    const state = complete(t)
                      ? 'done'
                      : idx === firstOpen
                        ? 'current'
                        : idx < firstOpen
                          ? 'open'
                          : 'locked';
                    const title = full.course.topics[id]?.title ?? id;
                    const mastered = (t?.mastery ?? 0) >= 0.85 && complete(t);
                    const opened = sel === id;
                    const m = Math.round((t?.mastery ?? 0) * 100);
                    return (
                      <li
                        key={id}
                        className={`lp-step ${state}`}
                        style={{ '--x': `${SWAY[idx % SWAY.length]}cqw` } as React.CSSProperties}
                      >
                        {state === 'current' ? <span className="lp-here">Start here</span> : null}
                        <button
                          type="button"
                          className={`lp-node ${state}`}
                          style={{ '--p': t?.seen ? m : 0 } as React.CSSProperties}
                          aria-label={`${title}: ${state === 'locked' ? 'locked' : state === 'done' ? 'complete' : 'ready'}`}
                          aria-expanded={opened}
                          onClick={() => setSel(opened ? null : id)}
                        >
                          <span className="lp-disc">
                            <Icon
                              name={
                                state === 'locked'
                                  ? 'lock'
                                  : state === 'done'
                                    ? mastered
                                      ? 'award'
                                      : 'check'
                                    : state === 'current'
                                      ? 'play'
                                      : 'star'
                              }
                              size={24}
                            />
                          </span>
                        </button>
                        <span className="lp-label">
                          <b>{title}</b>
                          <small>
                            {state === 'locked'
                              ? 'Locked'
                              : state === 'done'
                                ? mastered
                                  ? 'Mastered'
                                  : 'Complete'
                                : t?.seen
                                  ? `${m}% strong`
                                  : state === 'current'
                                    ? 'Up next'
                                    : 'Open'}
                          </small>
                        </span>
                        {opened ? (
                          <div className="lp-pop" role="dialog" aria-label={title}>
                            {state === 'locked' ? (
                              <p className="small">Finish the topics before this one to unlock it.</p>
                            ) : (
                              <>
                                <p className="small">
                                  {t?.seen
                                    ? `Your estimate: ${m}%.${state === 'done' ? ' Complete.' : ' Reach 60% to complete it.'}`
                                    : 'Not started yet.'}
                                </p>
                                <div className="row wrap-r" style={{ gap: 8 }}>
                                  <Link
                                    className="btn solid sm"
                                    href={href(full.course.title, full.id, { id, title })}
                                  >
                                    {state === 'done' ? 'Review' : t?.seen ? 'Continue' : 'Start'}
                                  </Link>
                                  <Link
                                    className="btn sm"
                                    href={`/app/courses/${full.id}/practice?topic=${id}`}
                                  >
                                    Practise
                                  </Link>
                                </div>
                              </>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                  <li
                    className={`lp-step check ${finished ? 'done' : 'locked'}`}
                    style={{ '--x': '0cqw' } as React.CSSProperties}
                  >
                    <span className="lp-node check" aria-hidden="true">
                      <span className="lp-disc">
                        <Icon name={finished ? 'award' : 'lock'} size={24} />
                      </span>
                    </span>
                    <span className="lp-label">
                      <b>{finished ? 'Unit complete' : 'Unit checkpoint'}</b>
                      <small>
                        {finished ? 'Great work. Keep going.' : `${u.topics.length - unitDone} to go`}
                      </small>
                    </span>
                  </li>
                </ol>
              )}
            </Unit>
          </div>
        );
      })}
    </section>
  );
}
