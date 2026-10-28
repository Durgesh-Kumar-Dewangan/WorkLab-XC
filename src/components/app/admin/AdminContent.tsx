'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { Bars, Columns, Kpi, SYLLABUS, when } from './shared';

interface Content {
  days: number;
  generated: number;
  reused: number;
  reusePercent: number;
  byKind: { kind: string; generated: number; shared: number; saved: number }[];
  series: { day: string; generated: number; reused: number }[];
  pool: {
    topics: number;
    withPicture: number;
    assets: number;
    assetsByKind: { kind: string; n: number }[];
    picturesStored: number;
    storageMB: number;
    totalUses: number;
  };
  topReused: { title: string; depth: string; uses: number; hasPicture: boolean; updated: number }[];
}
interface Syl {
  users: number;
  courses: number;
  bySyllabus: { name: string; n: number }[];
  byLevel: { name: string; n: number }[];
  topCourses: { name: string; n: number }[];
  institutes: { name: string; n: number }[];
}

/** How much was written new and how much was served from storage instead, and what people study. */
export function AdminContent() {
  const [days, setDays] = useState(30);
  const [c, setC] = useState<Content | null>(null);
  const [s, setS] = useState<Syl | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<Content>(`/admin/report/content?days=${days}`)
      .then(setC)
      .catch((e) => setErr((e as ApiFail).message || 'Could not load.'));
  }, [days]);
  useEffect(() => {
    api<Syl>('/admin/report/syllabus')
      .then(setS)
      .catch(() => undefined);
  }, []);
  if (err) return <p className="small bad">{err}</p>;
  if (!c) return <Spinner size={18} />;
  return (
    <div className="ad-detail">
      <div className="ad-tools">
        <h2 className="h2" style={{ margin: 0 }}>
          Reused content
        </h2>
        <select
          className="input"
          aria-label="Period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          style={{ width: 'auto' }}
        >
          {[7, 30, 90, 365].map((d) => (
            <option key={d} value={d}>{`Last ${d} days`}</option>
          ))}
        </select>
      </div>
      <div className="ad-kpis">
        <Kpi
          label="Written new (AI used)"
          value={c.generated.toLocaleString()}
          sub="lessons, practice, pictures, canvas"
        />
        <Kpi
          label="Served from storage"
          value={c.reused.toLocaleString()}
          sub="no AI call, no cost"
          tone="good"
        />
        <Kpi label="Reuse rate" value={`${c.reusePercent}%`} sub="of everything asked for" tone="good" />
        <Kpi
          label="Stored topics"
          value={c.pool.topics.toLocaleString()}
          sub={`${c.pool.withPicture} with a picture`}
        />
        <Kpi
          label="Pictures stored"
          value={c.pool.picturesStored.toLocaleString()}
          sub={`${c.pool.storageMB} MB`}
        />
        <Kpi label="Times reused" value={c.pool.totalUses.toLocaleString()} sub="shared topics, all time" />
      </div>

      <section className="card">
        <h3 className="h3">A day at a time</h3>
        <Columns
          series={c.series.map((r) => ({ label: r.day, a: r.generated, b: r.reused }))}
          labels={['Written new', 'Reused']}
        />
      </section>

      <div className="ad-two">
        <section className="card">
          <h3 className="h3">By kind</h3>
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>New</th>
                  <th>From shared pool</th>
                  <th>Own copy</th>
                  <th>Reuse</th>
                </tr>
              </thead>
              <tbody>
                {c.byKind.map((k) => {
                  const t = k.generated + k.shared + k.saved;
                  return (
                    <tr key={k.kind}>
                      <td>{k.kind}</td>
                      <td className="num">{k.generated}</td>
                      <td className="num">{k.shared}</td>
                      <td className="num">{k.saved}</td>
                      <td className="num">{t ? `${Math.round((100 * (k.shared + k.saved)) / t)}%` : '–'}</td>
                    </tr>
                  );
                })}
                {!c.byKind.length ? (
                  <tr>
                    <td colSpan={5}>Nothing recorded in this period yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h3 className="h3">What the shared pool holds</h3>
          <Bars rows={c.pool.assetsByKind.map((a) => ({ name: a.kind, n: a.n }))} />
          <p className="small">{`${c.pool.topics} topic lessons at each depth, ${c.pool.assets} other lessons, games and practice sets.`}</p>
        </section>
      </div>

      <section className="card">
        <h3 className="h3">Most reused topics</h3>
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Depth</th>
                <th>Times reused</th>
                <th>Picture</th>
                <th>Last written</th>
              </tr>
            </thead>
            <tbody>
              {c.topReused.map((t, i) => (
                <tr key={i}>
                  <td>{t.title}</td>
                  <td>{t.depth}</td>
                  <td className="num">{t.uses}</td>
                  <td>{t.hasPicture ? 'yes' : 'no'}</td>
                  <td>{when(t.updated)}</td>
                </tr>
              ))}
              {!c.topReused.length ? (
                <tr>
                  <td colSpan={5}>No stored topics yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {s ? (
        <>
          <h2 className="h2" style={{ margin: '8px 0 0' }}>
            What people study
          </h2>
          <div className="ad-kpis">
            <Kpi label="Learners" value={s.users.toLocaleString()} />
            <Kpi label="Courses" value={s.courses.toLocaleString()} />
          </div>
          <div className="ad-two">
            <section className="card">
              <h3 className="h3">By syllabus type</h3>
              <Bars rows={s.bySyllabus.map((r) => ({ name: SYLLABUS[r.name] ?? r.name, n: r.n }))} />
            </section>
            <section className="card">
              <h3 className="h3">By level</h3>
              <Bars rows={s.byLevel} />
            </section>
            <section className="card">
              <h3 className="h3">Most common courses</h3>
              <Bars rows={s.topCourses} />
            </section>
            <section className="card">
              <h3 className="h3">Schools and institutes</h3>
              <Bars rows={s.institutes} />
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
