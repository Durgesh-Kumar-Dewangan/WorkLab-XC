'use client';

import { Md } from '@/components/learn/Md';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon, Spinner } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/controls';
import { api, ApiFail } from '@/lib/api/client';
import type { Course } from '@/lib/domain/types';
import { useCourses } from '@/lib/store/hooks';
import { ago } from '@/lib/util';

interface Draft {
  summary: string;
  objectives: string[];
  slides: { title: string; bullets: string[]; narration: string; formula?: string }[];
  questions: { q: string; options: string[]; answer: number; why: string }[];
  notes: string;
}
interface Saved {
  id: string;
  title: string;
  courseTitle: string | null;
  updated: number;
  uses: number;
  draft: Draft;
}
interface Placed extends Saved {
  subject: string;
  unit: string;
  courseId: string | null;
  topicId: string | null;
}
type View = 'topics' | 'questions' | 'notes';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Puts every saved lesson under its subject (course) and unit, using the learner's own courses to find them. */
function place(items: Saved[], courses: Course[]): Placed[] {
  return items.map((it) => {
    const key = norm(it.title);
    let course = courses.find(
      (c) =>
        it.courseTitle &&
        norm(c.title) === norm(it.courseTitle) &&
        Object.values(c.topics).some((t) => norm(t.title) === key),
    );
    course ??= courses.find((c) => Object.values(c.topics).some((t) => norm(t.title) === key));
    const topic = course ? Object.values(course.topics).find((t) => norm(t.title) === key) : undefined;
    const unit = course && topic ? course.units.find((u) => u.topics.includes(topic.id)) : undefined;
    return {
      ...it,
      subject: course?.title ?? it.courseTitle ?? 'Other topics',
      unit: unit?.title ?? 'Topics',
      courseId: course?.id ?? null,
      topicId: topic?.id ?? null,
    };
  });
}

function group<T extends Placed>(rows: T[]): [string, [string, T[]][]][] {
  const subjects = new Map<string, Map<string, T[]>>();
  rows.forEach((r) => {
    const u = subjects.get(r.subject) ?? new Map<string, T[]>();
    u.set(r.unit, [...(u.get(r.unit) ?? []), r]);
    subjects.set(r.subject, u);
  });
  return [...subjects].map(([s, u]) => [s, [...u]]);
}

/** Study notes you can read here. They are not offered for download, and selecting, copying and printing are switched off. */
function ProtectedNotes({ md }: { md: string }) {
  const blocks = <Md md={md} />;
  const stop = (e: React.SyntheticEvent) => e.preventDefault();
  return (
    <div
      className="noselect"
      onCopy={stop}
      onCut={stop}
      onContextMenu={stop}
      onDragStart={stop}
      aria-label="Notes, view only"
    >
      {blocks}
    </div>
  );
}

function Questions({ qs }: { qs: Draft['questions'] }) {
  const [open, setOpen] = useState<Record<number, number | null>>({});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {qs.map((q, i) => {
        const picked = open[i] ?? null;
        return (
          <div className="tq" key={i}>
            <div className="t">{`${i + 1}. ${q.q}`}</div>
            {q.options.map((o, k) => (
              <button
                key={k}
                type="button"
                className={`btn sm${picked !== null ? (k === q.answer ? ' okc' : k === picked ? ' badc' : '') : ''}`}
                disabled={picked !== null}
                onClick={() => setOpen((s) => ({ ...s, [i]: k }))}
              >
                {`${String.fromCharCode(65 + k)}. ${o}`}
              </button>
            ))}
            {picked !== null ? (
              <p className="small" style={{ marginTop: 8 }}>
                {(picked === q.answer ? 'Correct. ' : 'Not quite. ') + q.why}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Viewer({ it, onClose }: { it: Placed; onClose: () => void }) {
  const [tab, setTab] = useState<'lesson' | 'questions' | 'notes'>('lesson');
  const d = it.draft;
  return (
    <div className="card" role="region" aria-label={`Saved lesson: ${it.title}`}>
      <div className="hd">
        <div>
          <span className="label">{`${it.subject} · ${it.unit}`}</span>
          <h2 style={{ marginTop: 6 }}>{it.title}</h2>
        </div>
        <button className="btn sm" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="body">{d.summary}</p>
      <div className="tabs" role="tablist">
        {(
          [
            ['lesson', `Lesson · ${d.slides.length} slides`],
            ['questions', `Questions · ${d.questions.length}`],
            ...(d.notes ? [['notes', 'Notes']] : []),
          ] as [typeof tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        {tab === 'lesson' ? (
          <div className="list">
            {d.slides.map((s, i) => (
              <div className="li" key={i} style={{ alignItems: 'flex-start' }}>
                <span className="cr-n">{i + 1}</span>
                <div className="grow">
                  <div className="t">{s.title}</div>
                  <ul className="bul sm">
                    {s.bullets.map((b, k) => (
                      <li key={k}>{b}</li>
                    ))}
                  </ul>
                  {s.formula ? <div className="formula">{s.formula}</div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : tab === 'questions' ? (
          <Questions qs={d.questions} />
        ) : (
          <>
            <ProtectedNotes md={d.notes} />
            <p className="small" style={{ marginTop: 12 }}>
              Notes are for reading here. They can’t be downloaded or copied.
            </p>
          </>
        )}
      </div>
      {it.courseId && it.topicId ? (
        <div className="row wrap-r" style={{ marginTop: 14 }}>
          <Link className="btn sm solid" href={`/app/courses/${it.courseId}/topics/${it.topicId}`}>
            Study again
          </Link>
          <Link className="btn sm" href={`/app/courses/${it.courseId}/practice?topic=${it.topicId}`}>
            Practise
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function SavedPage() {
  const courses = useCourses();
  const [items, setItems] = useState<Saved[] | null>(null);
  const [err, setErr] = useState('');
  const [view, setView] = useState<View>('topics');
  const [subject, setSubject] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ items: Saved[] }>('/saved')
      .then((r) => alive && setItems(r.items))
      .catch((e: ApiFail) => alive && setErr(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const placed = useMemo(() => (items ? place(items, courses) : []), [items, courses]);
  const subjects = useMemo(() => [...new Set(placed.map((p) => p.subject))], [placed]);
  const shown = placed.filter((p) => !subject || p.subject === subject);
  const withNotes = shown.filter((p) => p.draft.notes);
  const nQs = shown.reduce((n, p) => n + p.draft.questions.length, 0);
  const open = placed.find((p) => p.id === openId) ?? null;

  const list = (rows: Placed[], pick: (p: Placed) => React.ReactNode) =>
    group(rows).map(([s, units]) => (
      <section className="card" key={s} aria-label={s}>
        <h2>{s}</h2>
        {units.map(([u, topics]) => (
          <div key={u} style={{ marginTop: 10 }}>
            <div className="label" style={{ marginBottom: 8 }}>
              {u}
            </div>
            <div className="list">{topics.map(pick)}</div>
          </div>
        ))}
      </section>
    ));

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Saved</h1>
          <p className="sub">
            Every lesson you have studied is saved here with its questions and notes, sorted by subject and
            unit.
          </p>
        </div>
        <div className="acts">
          {subjects.length > 1 ? (
            <select
              className="select"
              aria-label="Subject"
              style={{ width: 'auto' }}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {err ? (
        <div className="callout warn" role="alert">
          <Icon name="alert" size={18} />
          <span>{err}</span>
        </div>
      ) : null}
      {!items && !err ? (
        <div className="card row" role="status" style={{ gap: 12 }}>
          <Spinner size={18} />
          <span>Loading your saved lessons…</span>
        </div>
      ) : null}

      {items && !placed.length ? (
        <div className="empty">
          <Icon name="folder" size={26} />
          <h3 className="h3">Nothing saved yet</h3>
          <p className="body">
            When you study a topic, its lesson, questions and notes are saved here automatically.
          </p>
          <Link className="btn solid" href="/app/learn?view=path">
            Start learning
          </Link>
        </div>
      ) : null}

      {placed.length ? (
        <>
          <div className="g3">
            <div className="stat">
              <span className="label">Saved lessons</span>
              <div className="v">{shown.length}</div>
            </div>
            <div className="stat">
              <span className="label">Questions</span>
              <div className="v">{nQs}</div>
            </div>
            <div className="stat">
              <span className="label">With notes</span>
              <div className="v">{withNotes.length}</div>
            </div>
          </div>
          <Segmented<View>
            ariaLabel="What to show"
            value={view}
            onChange={(v) => {
              setView(v);
              setOpenId(null);
            }}
            options={[
              { value: 'topics', label: 'Lessons' },
              { value: 'questions', label: 'Question bank' },
              { value: 'notes', label: 'Notes' },
            ]}
          />
          {open ? <Viewer it={open} onClose={() => setOpenId(null)} /> : null}

          {view === 'topics' ? (
            list(shown, (p) => (
              <button
                key={p.id}
                type="button"
                className="li link"
                style={{ textAlign: 'left', width: '100%' }}
                onClick={() => setOpenId(p.id)}
              >
                <div className="grow">
                  <div className="t">{p.title}</div>
                  <div className="s">{`${p.draft.slides.length} slides · ${p.draft.questions.length} questions${p.draft.notes ? ' · notes' : ''} · ${ago(p.updated)}`}</div>
                </div>
                <Icon name="chev-r" size={15} />
              </button>
            ))
          ) : view === 'questions' ? (
            group(shown).map(([s, units]) => (
              <section className="card" key={s}>
                <h2>{s}</h2>
                {units.map(([u, topics]) => (
                  <details key={u} open style={{ marginTop: 10 }}>
                    <summary
                      className="label"
                      style={{ cursor: 'pointer' }}
                    >{`${u} · ${topics.reduce((n, t) => n + t.draft.questions.length, 0)} questions`}</summary>
                    {topics.map((t) => (
                      <details key={t.id} style={{ marginTop: 8 }}>
                        <summary
                          style={{ cursor: 'pointer', fontWeight: 500 }}
                        >{`${t.title} · ${t.draft.questions.length}`}</summary>
                        <div style={{ marginTop: 10 }}>
                          <Questions qs={t.draft.questions} />
                        </div>
                      </details>
                    ))}
                  </details>
                ))}
              </section>
            ))
          ) : withNotes.length ? (
            list(withNotes, (p) => (
              <button
                key={p.id}
                type="button"
                className="li link"
                style={{ textAlign: 'left', width: '100%' }}
                onClick={() => setOpenId(p.id)}
              >
                <div className="grow">
                  <div className="t">{p.title}</div>
                  <div className="s">Read the notes</div>
                </div>
                <Icon name="chev-r" size={15} />
              </button>
            ))
          ) : (
            <p className="small">No notes yet. Notes appear here for topics where they were written.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
