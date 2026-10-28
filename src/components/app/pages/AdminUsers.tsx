'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { ago } from '@/lib/util';

interface Row {
  id: string;
  name: string;
  email: string;
  created: number;
  lastLogin: number | null;
  verified: boolean;
  plan: string;
  planUntil: number | null;
  addons: string[];
  today: { sessions: number; jobs: number; images: number; chat: number };
  totalSessions: number;
  category: string;
  label: string;
  institute: string;
  rank: string;
  city: string;
  state: string;
  blocked: { until: number | null; reason: string } | null;
}
const SORTS: [string, string][] = [
  ['created', 'Joined'],
  ['lastLogin', 'Last sign-in'],
  ['name', 'Name'],
  ['totalSessions', 'Sessions'],
];

/** The private people table: who they are, what they study, how much they used today. Admin accounts only. */
export function AdminUsers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('created');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const size = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ rows: Row[]; total: number }>(
        `/admin/users?q=${encodeURIComponent(q)}&sort=${sort}&dir=${dir}&page=${page}&pageSize=${size}`,
      );
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    } finally {
      setLoading(false);
    }
  }, [q, sort, dir, page]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (id: string, body: Record<string, unknown>, done: string) => {
    setBusy(id);
    try {
      await api(`/admin/users/${id}`, { body });
      toast(done, 'ok');
      await load();
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    } finally {
      setBusy(null);
    }
  };
  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <section className="card" aria-labelledby="au-h" style={{ gridColumn: '1 / -1' }}>
      <div className="row wrap-r" style={{ justifyContent: 'space-between', gap: 8 }}>
        <h3 id="au-h">People ({total})</h3>
        <div className="row wrap-r" style={{ gap: 8 }}>
          <label className="sr-only" htmlFor="au-q">
            Search people
          </label>
          <input
            id="au-q"
            className="input"
            type="search"
            placeholder="Search name, email, school"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <label className="sr-only" htmlFor="au-sort">
            Sort by
          </label>
          <select id="au-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button
            className="btn sm"
            type="button"
            onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            aria-label={`Sort ${dir === 'asc' ? 'descending' : 'ascending'}`}
          >
            {dir === 'asc' ? '↑' : '↓'}
          </button>
          <a className="btn sm" href="/api/admin/users?format=csv" download>
            <Icon name="file" size={14} /> CSV
          </a>
        </div>
      </div>
      <div
        className="tbl-wrap"
        role="region"
        aria-label="People table"
        tabIndex={0}
        style={{ overflowX: 'auto' }}
      >
        <table className="tbl" style={{ width: '100%', minWidth: 980 }}>
          <caption className="sr-only">Registered people with usage today</caption>
          <thead>
            <tr>
              <th scope="col">Name / email</th>
              <th scope="col">ID</th>
              <th scope="col">Plan</th>
              <th scope="col">Today (sess · runs · img · chat)</th>
              <th scope="col">Syllabus</th>
              <th scope="col">Institute</th>
              <th scope="col">Rank</th>
              <th scope="col">Last in</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                  <div className="small">
                    {r.email}
                    {r.verified ? '' : ' (unverified)'}
                  </div>
                </td>
                <td className="mono small">{r.id}</td>
                <td>
                  {r.plan}
                  {r.addons.length ? <div className="small">+ {r.addons.join(', ')}</div> : null}
                </td>
                <td>
                  {r.today.sessions} · {r.today.jobs} · {r.today.images} · {r.today.chat}
                </td>
                <td>
                  {r.category || '–'}
                  {r.label ? <div className="small">{r.label}</div> : null}
                </td>
                <td>
                  {r.institute || '–'}
                  {r.city ? (
                    <div className="small">
                      {r.city}
                      {r.state ? `, ${r.state}` : ''}
                    </div>
                  ) : null}
                </td>
                <td>{r.rank || '–'}</td>
                <td>{r.lastLogin ? ago(r.lastLogin) : 'never'}</td>
                <td>
                  {r.blocked ? (
                    <span className="chip amber">
                      Blocked{r.blocked.until ? ` until ${new Date(r.blocked.until).toLocaleString()}` : ''}
                    </span>
                  ) : (
                    <span className="chip green">Active</span>
                  )}
                </td>
                <td>
                  <div className="row wrap-r" style={{ gap: 4 }}>
                    {r.blocked ? (
                      <button
                        className="btn xs"
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => act(r.id, { action: 'unblock' }, 'Unblocked.')}
                      >
                        Unblock
                      </button>
                    ) : (
                      <button
                        className="btn xs"
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => {
                          const reason = window.prompt('Reason shown to the person (optional)') ?? null;
                          if (reason !== null) void act(r.id, { action: 'block', reason }, 'Blocked.');
                        }}
                      >
                        Block
                      </button>
                    )}
                    <button
                      className="btn xs"
                      type="button"
                      disabled={busy === r.id}
                      onClick={() =>
                        act(
                          r.id,
                          { action: 'grant_plan', plan: 'learner', days: 30 },
                          '30 days of Learner added.',
                        )
                      }
                    >
                      +30d paid
                    </button>
                    <button
                      className="btn xs"
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, { action: 'reset_quota' }, 'Today’s allowance reset.')}
                    >
                      Reset today
                    </button>
                    <button
                      className="btn xs"
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => act(r.id, { action: 'force_logout' }, 'Signed out everywhere.')}
                    >
                      Sign out
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={10} className="small">
                  {loading ? 'Loading…' : 'Nobody matches.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small" aria-live="polite">
          Page {page} of {pages}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>
            Previous
          </button>
          <button
            className="btn sm"
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((x) => x + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
