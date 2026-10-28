'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { Kpi, when } from './shared';

interface Fb {
  id: string;
  uid: string;
  kind: string;
  from: string | null;
  rating: number;
  comment: string;
  tags: string[];
  page?: string | null;
  created: number;
}

type Sort = 'new' | 'old' | 'low' | 'high';
const SORTS: [Sort, string][] = [
  ['new', 'Newest first'],
  ['old', 'Oldest first'],
  ['low', 'Lowest rating first'],
  ['high', 'Highest rating first'],
];
const TONE = ['', 'r1', 'r2', 'r3', 'r4', 'r5'];

function Stars({ n }: { n: number }) {
  return (
    <span className={clsx('ad-stars', TONE[n])} role="img" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= n ? 'on' : ''}>
          ★
        </i>
      ))}
    </span>
  );
}

/** Every rating and comment: how the scores are spread, then a list that can be sorted and filtered. */
export function AdminFeedback({ onOpenLearner }: { onOpenLearner?: (uid: string) => void }) {
  const [rows, setRows] = useState<Fb[] | null>(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [stars, setStars] = useState<number | null>(null);
  const [tag, setTag] = useState('');
  const [q, setQ] = useState('');
  const [withText, setWithText] = useState(false);
  const [menu, setMenu] = useState('');
  const [ask, setAsk] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmMany, setConfirmMany] = useState(false);
  const [busy, setBusy] = useState(false);

  const removeMany = async () => {
    const ids = [...picked];
    setBusy(true);
    try {
      const r = await api<{ removed: number }>('/admin/feedback/delete', { method: 'POST', body: { ids } });
      setRows((all) => (all ?? []).filter((f) => !picked.has(f.id)));
      setPicked(new Set());
      toast(`${r.removed} removed.`, 'ok');
    } catch (e) {
      toast((e as ApiFail).message || 'Could not remove them.', 'err');
    }
    setConfirmMany(false);
    setBusy(false);
  };

  const remove = async (id: string) => {
    try {
      await api(`/admin/feedback/${id}`, { method: 'DELETE' });
      setRows((r) => (r ?? []).filter((f) => f.id !== id));
      setPicked((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
      toast('Feedback removed.', 'ok');
    } catch (e) {
      toast((e as ApiFail).message || 'Could not remove it.', 'err');
    }
    setAsk('');
    setMenu('');
  };

  useEffect(() => {
    api<{ feedback: Fb[] }>('/admin/feedback?limit=500')
      .then((r) => setRows(r.feedback))
      .catch((e) => setErr((e as ApiFail).message || 'Could not load.'));
  }, []);

  const stats = useMemo(() => {
    const all = rows ?? [];
    const dist = [0, 0, 0, 0, 0, 0];
    let sum = 0;
    for (const f of all) {
      dist[f.rating] += 1;
      sum += f.rating;
    }
    const tags = new Map<string, number>();
    for (const f of all) for (const t of f.tags || []) tags.set(t, (tags.get(t) ?? 0) + 1);
    return {
      n: all.length,
      avg: all.length ? sum / all.length : null,
      dist,
      happy: all.filter((f) => f.rating >= 4).length,
      unhappy: all.filter((f) => f.rating <= 2).length,
      tags: [...tags.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = (rows ?? []).filter(
      (f) =>
        (stars === null || f.rating === stars) &&
        (!tag || (f.tags || []).includes(tag)) &&
        (!withText || f.comment.trim()) &&
        (!needle ||
          `${f.comment} ${f.from ?? ''} ${(f.tags || []).join(' ')}`.toLowerCase().includes(needle)),
    );
    const by: Record<Sort, (a: Fb, b: Fb) => number> = {
      new: (a, b) => b.created - a.created,
      old: (a, b) => a.created - b.created,
      low: (a, b) => a.rating - b.rating || b.created - a.created,
      high: (a, b) => b.rating - a.rating || b.created - a.created,
    };
    return out.sort(by[sort]);
  }, [rows, sort, stars, tag, q, withText]);

  if (err) return <p className="small bad">{err}</p>;
  if (rows === null) return <Spinner size={16} />;
  const max = Math.max(1, ...stats.dist.slice(1));

  return (
    <>
      <h2 className="h2">Feedback and ratings</h2>
      <div className="ad-kpis">
        <Kpi
          label="Average rating"
          value={stats.avg === null ? '–' : `${stats.avg.toFixed(2)} / 5`}
          sub={`${stats.n} responses`}
        />
        <Kpi
          label="Happy (4–5 stars)"
          value={stats.happy}
          tone="good"
          sub={stats.n ? `${Math.round((100 * stats.happy) / stats.n)}%` : ''}
        />
        <Kpi
          label="Unhappy (1–2 stars)"
          value={stats.unhappy}
          tone={stats.unhappy ? 'warn' : undefined}
          sub={stats.n ? `${Math.round((100 * stats.unhappy) / stats.n)}%` : ''}
        />
      </div>

      <section className="card" aria-label="Rating spread">
        <h3 className="h3">How the ratings are spread</h3>
        <ul className="ad-dist">
          {[5, 4, 3, 2, 1].map((n) => (
            <li key={n}>
              <button
                type="button"
                className={clsx(stars === n && 'on')}
                aria-pressed={stars === n}
                onClick={() => setStars(stars === n ? null : n)}
                title={`Show only ${n}-star ratings`}
              >
                <span>{n} ★</span>
                <i>
                  <u
                    className={TONE[n]}
                    style={{ width: `${stats.dist[n] ? Math.max(2, (stats.dist[n] / max) * 100) : 0}%` }}
                  />
                </i>
                <b>
                  {stats.dist[n]}
                  <small> {stats.n ? `${Math.round((100 * stats.dist[n]) / stats.n)}%` : ''}</small>
                </b>
              </button>
            </li>
          ))}
        </ul>
        {stats.tags.length ? (
          <p className="ad-chips">
            {stats.tags.slice(0, 12).map(([t, n]) => (
              <button
                key={t}
                type="button"
                className={clsx('ad-chip', tag === t && 'on')}
                aria-pressed={tag === t}
                onClick={() => setTag(tag === t ? '' : t)}
              >
                {t} · {n}
              </button>
            ))}
          </p>
        ) : null}
      </section>

      <section className="card" aria-label="All feedback">
        <div className="ad-tools">
          <input
            className="input"
            placeholder="Search comments or learners"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search"
          />
          <select
            className="input"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort"
            style={{ width: 'auto' }}
          >
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <label className="small ad-check">
            <input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} /> With
            a comment
          </label>
          {stars !== null || tag || q || withText ? (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setStars(null);
                setTag('');
                setQ('');
                setWithText(false);
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
        <div className="ad-bulk">
          <label className="small ad-check">
            <input
              type="checkbox"
              checked={shown.length > 0 && shown.every((f) => picked.has(f.id))}
              onChange={(e) => {
                setConfirmMany(false);
                setPicked(e.target.checked ? new Set(shown.map((f) => f.id)) : new Set());
              }}
            />{' '}
            Select all shown
          </label>
          <span className="small">
            Showing {shown.length} of {stats.n}
            {picked.size ? ` · ${picked.size} selected` : ''}
          </span>
          {picked.size ? (
            confirmMany ? (
              <span className="ad-bulk-ask">
                <span className="small">Remove {picked.size} for good?</span>
                <button type="button" className="btn sm danger" disabled={busy} onClick={removeMany}>
                  Yes, remove
                </button>
                <button type="button" className="btn sm" onClick={() => setConfirmMany(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <span className="ad-bulk-ask">
                <button type="button" className="btn sm danger" onClick={() => setConfirmMany(true)}>
                  Remove selected ({picked.size})
                </button>
                <button type="button" className="btn sm" onClick={() => setPicked(new Set())}>
                  Clear selection
                </button>
              </span>
            )
          ) : null}
        </div>
        <ul className="ad-fb">
          {shown.map((f) => (
            <li key={f.id} className={clsx(TONE[f.rating], picked.has(f.id) && 'picked')}>
              <div className="ad-fb-top">
                <input
                  type="checkbox"
                  aria-label={`Select feedback from ${f.from ?? 'a deleted user'}`}
                  checked={picked.has(f.id)}
                  onChange={() => {
                    setConfirmMany(false);
                    setPicked((p) => {
                      const n = new Set(p);
                      if (!n.delete(f.id)) n.add(f.id);
                      return n;
                    });
                  }}
                />
                <Stars n={f.rating} />
                {onOpenLearner ? (
                  <button type="button" className="ad-link" onClick={() => onOpenLearner(f.uid)}>
                    {f.from ?? 'deleted user'}
                  </button>
                ) : (
                  <span>{f.from ?? 'deleted user'}</span>
                )}
                <small>{when(f.created)}</small>
                {f.page ? <small className="mono">{f.page}</small> : null}
                <div className="ad-more">
                  <button
                    type="button"
                    className="ad-dots"
                    aria-label="More options"
                    aria-haspopup="menu"
                    aria-expanded={menu === f.id}
                    onClick={() => {
                      setAsk('');
                      setMenu(menu === f.id ? '' : f.id);
                    }}
                  >
                    ⋯
                  </button>
                  {menu === f.id ? (
                    <div className="ad-menu" role="menu">
                      {ask === f.id ? (
                        <>
                          <p className="small">Remove this feedback for good?</p>
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            onClick={() => remove(f.id)}
                          >
                            Yes, remove it
                          </button>
                          <button type="button" role="menuitem" onClick={() => setAsk('')}>
                            Keep it
                          </button>
                        </>
                      ) : (
                        <>
                          {onOpenLearner ? (
                            <button type="button" role="menuitem" onClick={() => onOpenLearner(f.uid)}>
                              Open the learner
                            </button>
                          ) : null}
                          {f.comment.trim() ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                navigator.clipboard?.writeText(f.comment).then(() => toast('Copied.', 'ok'));
                                setMenu('');
                              }}
                            >
                              Copy the comment
                            </button>
                          ) : null}
                          <button
                            type="button"
                            role="menuitem"
                            className="danger"
                            onClick={() => setAsk(f.id)}
                          >
                            Remove feedback
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              {f.comment.trim() ? <p>{f.comment}</p> : null}
              {f.tags?.length ? (
                <p className="ad-chips">
                  {f.tags.map((t) => (
                    <span key={t} className="ad-chip">
                      {t}
                    </span>
                  ))}
                </p>
              ) : null}
            </li>
          ))}
          {!shown.length ? <li className="small">No feedback matches.</li> : null}
        </ul>
      </section>
    </>
  );
}
