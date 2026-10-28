'use client';

import { SyllabusFilterOptions } from '@/components/app/CurriculumFields';
import { curriculumLabel } from '@/lib/curricula';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Icon';
import { Switch } from '@/components/ui/controls';
import { api, ApiFail } from '@/lib/api/client';
import { syncFromServer } from '@/lib/api/sync';
import { toast } from '@/lib/ui/toast';

interface Mine {
  id: string;
  title: string;
  topics: number;
  public: boolean;
}
interface Row {
  id: string;
  title: string;
  topics: number;
  units: number;
  adds: number;
  publisher: string;
  category: string;
  education: string;
}

const LEARNERS = [
  ['', 'Every learner'],
  ['school', 'School'],
  ['college', 'College'],
  ['competitive', 'Competitive'],
  ['professional', 'Professional'],
  ['self', 'Self-study'],
] as const;
const pretty = (list: readonly (readonly [string, string])[], v: string) =>
  (v ? list.find((x) => x[0] === v)?.[1] : '') || '';

/** Publish your own syllabus outline for others, and browse the ones other learners have published. Only the outline is shared. */
export function PublicSyllabi() {
  const [mine, setMine] = useState<Mine[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [education, setEducation] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState('');
  const [units, setUnits] = useState<{ title: string; topics: string[] }[]>([]);
  const [tick, setTick] = useState(0);

  const loadMine = useCallback(() => {
    api<{ courses: Mine[] }>('/courses')
      .then((r) => setMine(r.courses))
      .catch(() => undefined);
  }, []);
  useEffect(loadMine, [loadMine]);
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q, category, education });
      api<{ syllabi: Row[] }>(`/syllabi?${qs}`)
        .then((r) => setRows(r.syllabi))
        .catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, category, education, tick]);

  const publish = async (id: string, v: boolean) => {
    setBusy(id);
    try {
      await api(`/courses/${encodeURIComponent(id)}/public`, { method: 'PUT', body: { public: v } });
      toast(
        v ? 'Your syllabus is public. Only its outline is shared.' : 'Your syllabus is private again.',
        'ok',
      );
      loadMine();
      setTick((n) => n + 1);
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    } finally {
      setBusy('');
    }
  };
  const add = async (id: string) => {
    setBusy(id);
    try {
      await api(`/syllabi/${encodeURIComponent(id)}/add`, { body: {} });
      toast('Added to your courses.', 'ok');
      await syncFromServer(true);
      loadMine();
      setTick((n) => n + 1);
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    } finally {
      setBusy('');
    }
  };
  const report = async (id: string) => {
    try {
      await api(`/syllabi/${encodeURIComponent(id)}/report`, { body: { reason: 'reported by a learner' } });
      toast('Thank you. We will look at it.', 'ok');
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    }
  };
  const peek = (id: string) => {
    if (open === id) return setOpen('');
    setOpen(id);
    setUnits([]);
    api<{ units: { title: string; topics: string[] }[] }>(`/syllabi/${encodeURIComponent(id)}`)
      .then((r) => setUnits(r.units))
      .catch(() => undefined);
  };

  return (
    <section className="ps-wrap" aria-label="Public syllabi">
      <div className="ph" style={{ marginTop: 28 }}>
        <div>
          <h2 className="h2">Public syllabi</h2>
          <p className="sub">
            Share your syllabus with other learners, or copy one that fits your course. Only the unit and
            topic names are shared. Your lessons, notes and files stay yours.
          </p>
        </div>
      </div>

      {mine.length ? (
        <div className="card ps-mine">
          <h3 className="h3">Yours</h3>
          <ul className="pl-items">
            {mine.map((c) => (
              <li key={c.id}>
                <span className="grow">
                  <b>{c.title}</b>
                  <small>{c.public ? 'Public. Anyone signed in can copy its outline.' : 'Private'}</small>
                </span>
                <Switch
                  checked={c.public}
                  disabled={busy === c.id}
                  onChange={(v) => void publish(c.id, v)}
                  label={`Make ${c.title} public`}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="ps-filters">
        <input
          className="input"
          type="search"
          placeholder="Search public syllabi"
          aria-label="Search public syllabi"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input"
          aria-label="Syllabus"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <SyllabusFilterOptions />
        </select>
        <select
          className="input"
          aria-label="Learner type"
          value={education}
          onChange={(e) => setEducation(e.target.value)}
        >
          {LEARNERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {rows === null ? (
        <Spinner size={18} />
      ) : rows.length ? (
        <ul className="pl-items ps-list">
          {rows.map((s) => (
            <li key={s.id} className="ps-row">
              <span className="grow">
                <b>{s.title}</b>
                <small>
                  {[
                    `${s.units} units · ${s.topics} topics`,
                    curriculumLabel(s.category),
                    pretty(LEARNERS, s.education),
                    `by ${s.publisher}`,
                    s.adds ? `${s.adds} copied` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
                {open === s.id ? (
                  <ol className="ps-units">
                    {units.map((u) => (
                      <li key={u.title}>
                        <b>{u.title}</b>
                        <span>{u.topics.join(', ')}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </span>
              <button className="btn xs" type="button" onClick={() => peek(s.id)}>
                {open === s.id ? 'Hide' : 'Preview'}
              </button>
              <button
                className="btn xs solid"
                type="button"
                disabled={busy === s.id}
                onClick={() => void add(s.id)}
              >
                Add
              </button>
              <button
                className="btn xs"
                type="button"
                onClick={() => void report(s.id)}
                aria-label={`Report ${s.title}`}
              >
                Report
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">
          No public syllabi match yet. Be the first: switch one of yours to public above.
        </p>
      )}
    </section>
  );
}
