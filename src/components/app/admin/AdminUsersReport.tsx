'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { SyllabusFilterOptions } from '@/components/app/CurriculumFields';
import { Bars, Columns, hm, Kpi, money, SYLLABUS, day, when } from './shared';

interface Row {
  id: string;
  name: string;
  email: string;
  username: string;
  plan: string;
  category: string;
  education: string;
  label: string;
  institute: string;
  country: string;
  created: number;
  lastSeen: number | null;
  courses: number;
  textGens: number;
  imageGens: number;
  minutes: { today: number; month: number; total: number; activeDays: number };
}
interface Detail {
  account: Record<string, unknown> & {
    id: string;
    name: string;
    email: string;
    plan: string;
    username?: string;
  };
  profile: Record<string, unknown>;
  rewards: {
    xp: number;
    weekXp: number;
    streak: number;
    best: number;
    gems: number;
    alias: string;
    board: boolean;
  };
  usage: { all: Record<string, number>; month: Record<string, number>; textGens: number; imageGens: number };
  time: {
    today: number;
    month: number;
    total: number;
    activeDays: number;
    byMonth: { month: string; minutes: number }[];
    days: { day: string; minutes: number; events: number; answered: number; correct: number }[];
  };
  courses: {
    id: string;
    title: string;
    topics: number;
    created: number;
    source: string;
    public: boolean;
    copiedFrom: string;
  }[];
  jobs: { id: string; status: string; topics: number; created: number; error: string }[];
  library: {
    total: number;
    byKind: Record<string, number>;
    recent: { title: string; kind: string; uses: number; updated: number }[];
  };
  assets: {
    total: number;
    byKind: Record<string, number>;
    recent: { key: string; kind: string; version: number; updated: number }[];
  };
  counts: { canvases: number; exams: number; libraryItems: number };
  orders: {
    id: string;
    status: string;
    item: string;
    billing?: string;
    amountMinor: number;
    currency: string;
    gateway: string;
    country: string;
    created: number;
    paidAt?: number;
  }[];
  entitlements: { sku: string; quantity: number | null; validUntil: number | null }[];
  feedback: { rating: number; comment: string; tags: string[]; created: number }[];
  tickets: { id: string; status: string; message: string; created: number }[];
  audit: { at: number; actor: string; action: string; detail: Record<string, unknown> }[];
}

const USAGE_LABEL: Record<string, string> = {
  gen: 'Lessons and practice written',
  jobtopics: 'Topics written in runs',
  images: 'Pictures made',
  jobs: 'Generation runs',
  exam: 'Exam papers',
  chat: 'Tutor messages',
  sessions: 'Learning sessions',
  answers: 'Full answers',
};

/** Learners, with the hours they spend, what they study and how much they generate. Click a name for everything about that person. */
export function AdminUsersReport({
  onOpenDoc,
  initialOpen = '',
}: {
  onOpenDoc: (col: string, id: string) => void;
  initialOpen?: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [plan, setPlan] = useState('');
  const [sort, setSort] = useState('lastSeen');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(initialOpen);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    const qs = new URLSearchParams({ q, category, plan, sort, dir: 'desc', page: String(page), size: '25' });
    api<{ rows: Row[]; total: number }>(`/admin/report/users?${qs}`)
      .then((r) => {
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e) => setErr((e as ApiFail).message || 'Could not load.'));
  }, [q, category, plan, sort, page]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  if (open) return <UserDetail id={open} onBack={() => setOpen('')} onOpenDoc={onOpenDoc} />;
  return (
    <section className="card" aria-label="Learners">
      <div className="ad-tools">
        <input
          className="input"
          type="search"
          placeholder="Search name, email, username, school"
          aria-label="Search learners"
          value={q}
          onChange={(e) => (setPage(1), setQ(e.target.value))}
        />
        <select
          className="input"
          aria-label="Syllabus"
          value={category}
          onChange={(e) => (setPage(1), setCategory(e.target.value))}
        >
          <SyllabusFilterOptions />
        </select>
        <select
          className="input"
          aria-label="Plan"
          value={plan}
          onChange={(e) => (setPage(1), setPlan(e.target.value))}
        >
          <option value="">All plans</option>
          <option value="prototype">Free</option>
          <option value="learner">Beta / Plus</option>
        </select>
        <select className="input" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="lastSeen">Last seen</option>
          <option value="created">Joined</option>
          <option value="textGens">Most text generated</option>
          <option value="imageGens">Most pictures</option>
          <option value="courses">Most courses</option>
          <option value="name">Name</option>
        </select>
      </div>
      {err ? <p className="small bad">{err}</p> : null}
      {rows === null ? (
        <Spinner size={18} />
      ) : (
        <div className="tablewrap">
          <table className="table ad-table">
            <thead>
              <tr>
                <th>Learner</th>
                <th>Plan</th>
                <th>Studies</th>
                <th>Time: today · month · total</th>
                <th>Courses</th>
                <th>Text</th>
                <th>Pictures</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button type="button" className="ad-link" onClick={() => setOpen(r.id)}>
                      <b>{r.name}</b>
                      <small>
                        {r.username ? `@${r.username} · ` : ''}
                        {r.email}
                      </small>
                    </button>
                  </td>
                  <td>
                    <span className="navtag">{r.plan === 'prototype' ? 'Free' : 'Paid'}</span>
                  </td>
                  <td>
                    {SYLLABUS[r.category] ?? '–'}
                    <small className="ad-sub">{[r.label, r.institute].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td className="num">{`${hm(r.minutes.today)} · ${hm(r.minutes.month)} · ${hm(r.minutes.total)}`}</td>
                  <td className="num">{r.courses}</td>
                  <td className="num">{r.textGens}</td>
                  <td className="num">{r.imageGens}</td>
                  <td>{when(r.lastSeen)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={8}>No learners match.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      <div className="ad-pager">
        <span className="small">{`${total.toLocaleString()} learner${total === 1 ? '' : 's'}`}</span>
        <button className="btn xs" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span className="small">{`Page ${page}`}</span>
        <button
          className="btn xs"
          type="button"
          disabled={page * 25 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v === '' || v === null || v === undefined ? '–' : v}</dd>
    </div>
  );
}

function UserDetail({
  id,
  onBack,
  onOpenDoc,
}: {
  id: string;
  onBack: () => void;
  onOpenDoc: (col: string, id: string) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<Detail>(`/admin/report/user?id=${encodeURIComponent(id)}`)
      .then(setD)
      .catch((e) => setErr((e as ApiFail).message || 'Could not load.'));
  }, [id]);
  if (err) return <p className="small bad">{err}</p>;
  if (!d) return <Spinner size={18} />;
  const a = d.account as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const p = d.profile as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const days = [...d.time.days].slice(0, 30).reverse();
  return (
    <div className="ad-detail">
      <div className="ad-dhead">
        <button className="btn xs" type="button" onClick={onBack}>
          <Icon name="arrow-l" size={13} /> All learners
        </button>
        <div>
          <h2 className="h2">{a.name}</h2>
          <p className="small">{`${a.email}${a.username ? ` · @${a.username}` : ''} · ${a.id}`}</p>
        </div>
        <button className="btn xs" type="button" onClick={() => onOpenDoc('users', a.id)}>
          Open the record
        </button>
      </div>

      <div className="ad-kpis">
        <Kpi
          label="Time this month"
          value={hm(d.time.month)}
          sub={`${hm(d.time.today)} today · ${hm(d.time.total)} in all`}
        />
        <Kpi label="Active days" value={d.time.activeDays} sub="days with any activity" />
        <Kpi
          label="Text generated"
          value={d.usage.textGens}
          sub={`${d.usage.month.gen + d.usage.month.jobtopics} this month`}
        />
        <Kpi label="Pictures made" value={d.usage.imageGens} sub={`${d.usage.month.images} this month`} />
        <Kpi label="Courses" value={d.courses.length} sub={`${d.counts.libraryItems} saved topics`} />
        <Kpi
          label="Streak"
          value={`${d.rewards.streak} days`}
          sub={`${d.rewards.xp} points, best ${d.rewards.best}`}
        />
      </div>

      <div className="ad-two">
        <section className="card">
          <h3 className="h3">Account</h3>
          <dl className="ad-facts">
            <Fact k="Plan" v={`${a.plan}${a.planUntil ? ` until ${day(a.planUntil)}` : ''}`} />
            <Fact k="Joined" v={when(a.created)} />
            <Fact k="Last login" v={when(a.lastLogin)} />
            <Fact k="Last seen" v={when(a.lastSeen)} />
            <Fact k="Sessions" v={a.sessions} />
            <Fact k="Email" v={a.emailVerified ? 'confirmed' : 'not confirmed'} />
            <Fact k="Country" v={[a.country, a.region].filter(Boolean).join(' · ')} />
            <Fact k="Role" v={a.role} />
            <Fact k="Consent given" v={when(a.consentAt)} />
            <Fact k="Referral code" v={a.referralCode} />
            <Fact k="Friends joined" v={a.friendsJoined} />
            <Fact k="Referred by" v={a.referredBy} />
            <Fact k="Blocked" v={a.blocked ? `${a.blocked.reason}` : 'no'} />
          </dl>
        </section>
        <section className="card">
          <h3 className="h3">Profile</h3>
          <dl className="ad-facts">
            <Fact k="Username" v={p.handle} />
            <Fact k="Syllabus" v={SYLLABUS[p.category] ?? p.category} />
            <Fact k="Level" v={p.education} />
            <Fact k="Class or year" v={p.label} />
            <Fact k="School or institute" v={p.institute} />
            <Fact k="Age" v={p.age || p.ageBand} />
            <Fact k="Goal" v={p.goal} />
            <Fact k="Daily goal" v={p.dailyGoal ? `${p.dailyGoal} points` : ''} />
            <Fact k="City / state" v={[p.city, p.state].filter(Boolean).join(', ')} />
            <Fact k="Public profile" v={p.publicProfile ? 'yes' : 'no'} />
            <Fact
              k="On the leaderboard"
              v={p.leaderboard ? `yes, as ${d.rewards.alias}` : `league name ${d.rewards.alias}`}
            />
          </dl>
        </section>
      </div>

      <section className="card">
        <h3 className="h3">Time spent</h3>
        <Columns
          series={days.map((x) => ({ label: x.day, a: x.minutes }))}
          labels={['Minutes a day, last 30 days']}
        />
        <div className="ad-months">
          {d.time.byMonth.map((m) => (
            <span key={m.month}>
              <b>{hm(m.minutes)}</b>
              <small>{m.month}</small>
            </span>
          ))}
        </div>
      </section>

      <div className="ad-two">
        <section className="card">
          <h3 className="h3">Generations</h3>
          <table className="table">
            <thead>
              <tr>
                <th>What</th>
                <th>This month</th>
                <th>All time</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(USAGE_LABEL).map((k) => (
                <tr key={k}>
                  <td>{USAGE_LABEL[k]}</td>
                  <td className="num">{d.usage.month[k] ?? 0}</td>
                  <td className="num">{d.usage.all[k] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h3 className="h3">Courses</h3>
          {d.courses.length ? (
            <ul className="ad-list">
              {d.courses.map((c) => (
                <li key={c.id}>
                  <b>{c.title}</b>
                  <small>{`${c.topics} topics · added ${day(c.created)}${c.source ? ` · ${c.source}` : ''}${c.public ? ' · public' : ''}`}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small">No courses.</p>
          )}
        </section>
      </div>

      <section className="card">
        <h3 className="h3">Topics and content generated</h3>
        <p className="small">{`${d.library.total} saved topics (${
          Object.entries(d.library.byKind)
            .map(([k, n]) => `${n} ${k}`)
            .join(', ') || 'none'
        }) · ${d.assets.total} lessons, games and practice sets (${
          Object.entries(d.assets.byKind)
            .map(([k, n]) => `${n} ${k}`)
            .join(', ') || 'none'
        })`}</p>
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Kind</th>
                <th>Reused</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {d.library.recent.map((i, k) => (
                <tr key={k}>
                  <td>{i.title}</td>
                  <td>{i.kind}</td>
                  <td className="num">{i.uses}</td>
                  <td>{when(i.updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.jobs.length ? (
          <p className="small">{`Recent runs: ${d.jobs.map((j) => `${j.status} (${j.topics} topics, ${when(j.created)})`).join(' · ')}`}</p>
        ) : null}
      </section>

      <div className="ad-two">
        <section className="card">
          <h3 className="h3">Payments and plan</h3>
          {d.orders.length ? (
            <table className="table">
              <tbody>
                {d.orders.map((o) => (
                  <tr key={o.id}>
                    <td>{`${o.item}${o.billing ? ` (${o.billing})` : ''}`}</td>
                    <td className="num">{money(o.amountMinor, o.currency)}</td>
                    <td>{`${o.status} · ${o.gateway}${o.country ? ` · ${o.country}` : ''}`}</td>
                    <td>{day(o.paidAt || o.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="small">No payments.</p>
          )}
          {d.entitlements.length ? (
            <p className="small">{`Add-ons: ${d.entitlements.map((e) => `${e.sku}${e.quantity ? ` ×${e.quantity}` : ''}${e.validUntil ? ` until ${day(e.validUntil)}` : ''}`).join(' · ')}`}</p>
          ) : null}
        </section>
        <section className="card">
          <h3 className="h3">Feedback and tickets</h3>
          {d.feedback.length + d.tickets.length ? (
            <ul className="ad-list">
              {d.feedback.map((f, k) => (
                <li key={`f${k}`}>
                  <b>{`${'★'.repeat(f.rating)}${'☆'.repeat(Math.max(0, 5 - f.rating))}`}</b>
                  <small>{`${when(f.created)}${f.tags?.length ? ` · ${f.tags.join(', ')}` : ''}`}</small>
                  {f.comment ? <span>{f.comment}</span> : null}
                </li>
              ))}
              {d.tickets.map((t) => (
                <li key={t.id}>
                  <b>{`Ticket (${t.status})`}</b>
                  <small>{when(t.created)}</small>
                  <span>{t.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small">Nothing yet.</p>
          )}
        </section>
      </div>

      <section className="card">
        <h3 className="h3">Who has looked at this account</h3>
        {d.audit.length ? (
          <ul className="ad-list">
            {d.audit.map((x, k) => (
              <li key={k}>
                <b>{x.action}</b>
                <small>{`${when(x.at)} · ${x.actor}`}</small>
                {x.detail && Object.keys(x.detail).length ? <span>{JSON.stringify(x.detail)}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">No one has.</p>
        )}
      </section>
    </div>
  );
}

export { Bars };
