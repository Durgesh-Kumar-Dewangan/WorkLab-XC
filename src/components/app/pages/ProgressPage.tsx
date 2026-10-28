'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Segmented } from '@/components/ui/controls';
import { ActivityGraph, useActivity } from '@/components/app/ActivityGraph';
import { BarChart } from '@/components/app/BarChart';
import { EmptyWorkspace } from '@/components/app/EmptyWorkspace';
import { courseCounts, courseMastery, masteryOf, statusFor, topicTitle } from '@/lib/domain/courses';
import { STATUS_COLOR } from '@/lib/domain/graph';
import { STATUS_LABEL } from '@/lib/domain/mastery';
import { lastDays } from '@/lib/domain/stats';
import type { TopicStatus } from '@/lib/domain/types';
import { useApp } from '@/lib/store';
import { useCourses, useLearner } from '@/lib/store/hooks';

type Range = 7 | 14 | 30;
const KEYS: [TopicStatus, string][] = [
  ['mastered', 'var(--green)'],
  ['learning', 'var(--blue)'],
  ['review', 'var(--amber)'],
  ['new', 'var(--gray-bar)'],
];

export function ProgressPage() {
  const cs = useCourses();
  const d = useLearner();
  const router = useRouter();
  const sp = useSearchParams();
  const profile = useApp((s) => s.profile);
  const minutes = useApp((s) => s.minutes);
  const [cid, setCid] = useState(() => sp.get('course') ?? '');
  const [range, setRange] = useState<Range>(14);
  const activity = useActivity();

  if (!cs.length)
    return (
      <div className="page">
        <div className="ph">
          <h1>Progress</h1>
        </div>
        <EmptyWorkspace />
      </div>
    );
  const c = cs.find((x) => x.id === cid) ?? cs[0];
  const goal = profile.minutesPerDay || 30;
  const counts = courseCounts(d, c);
  const n = c.order.length;
  const rows = c.order.map((id) => ({ id, m: masteryOf(d, id), st: statusFor(d, id) }));
  const attempted = rows.filter((r) => r.m.att > 0);
  const totAtt = attempted.reduce((s, r) => s + r.m.att, 0);
  const totCor = attempted.reduce((s, r) => s + r.m.cor, 0);
  const strong = rows
    .filter((r) => r.m.att >= 2)
    .sort((a, b) => b.m.est - a.m.est)
    .slice(0, 3);
  const weak = rows
    .filter((r) => r.m.att >= 1)
    .sort((a, b) => a.m.est - b.m.est)
    .slice(0, 3);
  const days = lastDays(minutes, range);
  const total = Math.round(days.reduce((s, x) => s + x.min, 0));
  const active = days.filter((x) => x.min > 0).length;

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">{c.title}</div>
          <h1 style={{ marginTop: 8 }}>Progress</h1>
          <p className="sub">
            What your answers and study time suggest so far. These are estimates and they get better with more
            practice.
          </p>
        </div>
        <div className="acts">
          {cs.length > 1 ? (
            <select
              className="select"
              aria-label="Course"
              style={{ width: 'auto' }}
              value={c.id}
              onChange={(e) => setCid(e.target.value)}
            >
              {cs.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="g4">
        <div className="stat">
          <span className="label">Course estimate</span>
          <div className="v">{Math.round(courseMastery(d, c) * 100)}%</div>
        </div>
        <div className="stat">
          <span className="label">Answers</span>
          <div className="v">
            {totAtt}
            <small>{totAtt ? `${Math.round((totCor / totAtt) * 100)}% correct` : 'none yet'}</small>
          </div>
        </div>
        <div className="stat">
          <span className="label">{`Studied, ${range} days`}</span>
          <div className="v">
            {total}
            <small>min</small>
          </div>
        </div>
        <div className="stat">
          <span className="label">Active days</span>
          <div className="v">
            {active}
            <small>{`/ ${range}`}</small>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="hd">
          <h2>Learning activity</h2>
          <span className="label">Last 12 months</span>
        </div>
        <ActivityGraph days={activity} />
      </div>

      <div className="card">
        <h2>Units</h2>
        <div className="list">
          {c.units.map((u) => {
            const ms = u.topics.map((id) => masteryOf(d, id));
            const est = ms.length ? ms.reduce((a, m) => a + (m.est || 0), 0) / ms.length : 0;
            const strong = u.topics.filter((id) => statusFor(d, id) === 'mastered').length;
            return (
              <div className="li" key={u.id}>
                <div className="grow">
                  <div className="t">{u.title}</div>
                  <div className="s">{`${strong} of ${u.topics.length} topics strong`}</div>
                  <div className="bar" style={{ height: 8, marginTop: 8 }}>
                    <i
                      style={{ width: `${Math.round(est * 100)}%` }}
                      className={est < 0.5 ? 'lo' : est < 0.7 ? 'mid' : 'hi'}
                    />
                  </div>
                </div>
                <span className="num">{Math.round(est * 100)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="hd">
          <h2>Study time</h2>
          <Segmented<Range>
            ariaLabel="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: 7, label: '7 days' },
              { value: 14, label: '14 days' },
              { value: 30, label: '30 days' },
            ]}
          />
        </div>
        <BarChart days={days} goal={goal} label={`Minutes studied per day for the last ${range} days`} />
        <p className="small">
          Time counts while a lesson page is open and while you practise. Change the daily goal in your
          profile.
        </p>
      </div>

      <div className="card">
        <h2>Topic status</h2>
        <div
          className="stackbar"
          role="img"
          aria-label={`Topics by status: ${KEYS.map(([k]) => `${STATUS_LABEL[k]} ${counts[k]}`).join(', ')}`}
        >
          {KEYS.map(([k, col]) => (
            <i
              key={k}
              style={{ width: `${(counts[k] / n) * 100}%`, background: col }}
              title={`${STATUS_LABEL[k]}: ${counts[k]}`}
            />
          ))}
        </div>
        <div className="legend">
          {KEYS.map(([k, col]) => (
            <span key={k}>
              <i style={{ background: col }} />
              {`${STATUS_LABEL[k]} · ${counts[k]}`}
            </span>
          ))}
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <h2>Strongest so far</h2>
          {strong.length ? (
            <div className="list">
              {strong.map((r) => (
                <div
                  className="li link"
                  key={r.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(`/app/courses/${c.id}/topics/${r.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && router.push(`/app/courses/${c.id}/topics/${r.id}`)}
                >
                  <div className="grow">
                    <div className="t">{topicTitle(d, c, r.id)}</div>
                    <div className="s">{r.m.att} answers</div>
                  </div>
                  <span className="num">{Math.round(r.m.est * 100)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="small">Answer a few questions and your strongest topics show up here.</p>
          )}
        </div>
        <div className="card">
          <h2>Needs attention</h2>
          {weak.length ? (
            <div className="list">
              {weak.map((r) => (
                <div
                  className="li link"
                  key={r.id}
                  tabIndex={0}
                  role="link"
                  onClick={() => router.push(`/app/courses/${c.id}/practice?topic=${r.id}`)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && router.push(`/app/courses/${c.id}/practice?topic=${r.id}`)
                  }
                >
                  <div className="grow">
                    <div className="t">{topicTitle(d, c, r.id)}</div>
                    <div className="s">{r.m.att} answers · tap to practise</div>
                  </div>
                  <span className="num">{Math.round(r.m.est * 100)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="small">Nothing flagged yet.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Every topic</h2>
        <div className="tmap">
          {c.units.map((u) => (
            <div key={u.id}>
              <div className="label" style={{ marginBottom: 8 }}>
                {u.title}
              </div>
              {u.topics.map((id) => {
                const m = masteryOf(d, id);
                const st = statusFor(d, id);
                const col = STATUS_COLOR[st] === 'var(--fg3)' ? 'var(--gray-bar)' : STATUS_COLOR[st];
                return (
                  <Link key={id} className="trow" href={`/app/courses/${c.id}/topics/${id}`}>
                    <span className="t">{topicTitle(d, c, id)}</span>
                    <span
                      className="bar"
                      style={{ height: 8 }}
                      role="img"
                      aria-label={`${Math.round(m.est * 100)} percent estimate`}
                    >
                      <i style={{ width: `${Math.round((m.est || 0) * 100)}%`, background: col }} />
                    </span>
                    <span className="num s">{m.att ? `${Math.round(m.est * 100)}%` : '—'}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <div className="legend">
          <span>Bar = estimate. Colour = status.</span>
        </div>
      </div>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontSize: 17, fontWeight: 500 }}>
          How these estimates work
        </summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <p className="body">
            Each topic starts with no estimate. Your first answer sets it to 60% (right) or 25% (wrong). After
            that, every answer moves it 30% of the way toward 100% (right) or 0% (wrong). A topic counts as
            strong after at least three answers with an estimate of 80% or more, and needs revision after at
            least two answers with an estimate under 50%.
          </p>
          <p className="body">
            It is a simple moving estimate, not a test score and not a model of you. With few answers it is
            noisy, and it cannot tell guessing from knowing. Self-ratings on template lessons only set a low
            starting point.
          </p>
        </div>
      </details>
    </div>
  );
}
