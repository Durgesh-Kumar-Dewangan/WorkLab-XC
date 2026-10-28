'use client';

import Link from 'next/link';
import { useAddons } from '@/hooks/useAddons';
import { useServerMe } from '@/hooks/useServerMe';

const ROWS: [key: 'sessions' | 'lessons' | 'exams' | 'chat', label: string, hint: string][] = [
  ['sessions', 'Learning sessions', 'topics you open to study today'],
  ['lessons', 'New lessons written', 'lessons the AI wrote for you today'],
  ['exams', 'Exam papers', 'papers set today'],
  ['chat', 'Tutor questions', 'questions asked today'],
];

/**
 * Where the learner stands on today's allowance. The bars are plain information. The upgrade hint appears only when
 * a bar is close to full, so a learner who is nowhere near a limit is never nudged.
 */
export function UsageCard() {
  const { me } = useServerMe();
  const addons = useAddons();
  if (!me?.today) return null;
  const plan = me.user.plan === 'learner' ? 'Beta' : me.user.plan === 'classroom' ? 'Classroom' : 'Free';
  const rows = ROWS.filter(([k]) => k !== 'chat' || addons.chatbot);
  const near = rows.some(([k]) => me.today![k][1] > 0 && me.today![k][0] / me.today![k][1] >= 0.7);
  return (
    <section className="card" aria-label="Plan and usage today">
      <div className="hd">
        <h2>{`${plan} plan`}</h2>
        <span className="label">Today · resets at midnight IST</span>
      </div>
      <div className="usage">
        {rows.map(([k, label, hint]) => {
          const [used, cap] = me.today![k];
          const pct = cap && cap < 9999 ? Math.min(100, (used / cap) * 100) : 0;
          return (
            <div key={k} className="usage-row">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>{label}</span>
                <span className="num small">{cap >= 9999 ? `${used} today · unlimited` : `${used} of ${cap}`}</span>
              </div>
              <div className="bar" style={{ height: 8 }} role="img" aria-label={`${label}: ${used} of ${cap} used, ${hint}`}>
                <i className={pct >= 100 ? 'lo' : pct >= 70 ? 'mid' : 'hi'} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {(
          [
            ['chat', 'Free tutor questions'],
            ['notes', 'Free unit notes'],
          ] as const
        ).map(([k, label]) => {
          const m = me.month?.[k];
          if (!m || m[1] <= 0 || (k === 'chat' && addons.chatbot)) return null;
          return (
            <div className="usage-row" key={k}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>{label}</span>
                <span className="num small">{`${m[0]} of ${m[1]} this month`}</span>
              </div>
              <div className="bar" style={{ height: 8 }} role="img" aria-label={`${label}: ${m[0]} of ${m[1]} used this month`}>
                <i className={m[0] >= m[1] ? 'lo' : 'hi'} style={{ width: `${Math.min(100, (m[0] / m[1]) * 100)}%` }} />
              </div>
            </div>
          );
        })}
        {me.month?.classroom
          ? (() => {
              const [used, cap] = me.month.classroom;
              return (
                <div className="usage-row">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>3D classroom sessions</span>
                    <span className="num small">{`${used} of ${cap} this month`}</span>
                  </div>
                  <div className="bar" style={{ height: 8 }} role="img" aria-label={`3D classroom: ${used} of ${cap} used this month`}>
                    <i className={used >= cap ? 'lo' : 'hi'} style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
                  </div>
                </div>
              );
            })()
          : null}
      </div>
      {near && me.user.plan === 'prototype' ? (
        <p className="small">
          Running low? <Link href="/pricing" style={{ textDecoration: 'underline' }}>Beta</Link> gives more every day, removes the ads and adds the 3D classroom.
        </p>
      ) : null}
    </section>
  );
}
