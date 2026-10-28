'use client';

import { useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Halftone } from '@/components/fx/Halftone';
import { AdSlot } from '@/components/ads/AdSlot';
import { UsageCard } from '@/components/app/UsageCard';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/lib/icon-paths';
import { StatusChip } from '@/components/ui/controls';
import { BarChart } from '@/components/app/BarChart';
import { CourseCard } from '@/components/app/CourseCard';
import { EmptyWorkspace } from '@/components/app/EmptyWorkspace';
import {
  courseCounts,
  courseMastery,
  masteryOf,
  recommend,
  statusFor,
  topicTitle,
} from '@/lib/domain/courses';
import { lastDays, streakDays, weekMinutes } from '@/lib/domain/stats';
import { paintClassroom } from '@/lib/fx/painters';
import { useApp } from '@/lib/store';
import { useCourses, useLearner } from '@/lib/store/hooks';
import { usePageMotion } from '@/hooks/usePageMotion';
import { ago } from '@/lib/util';

const HERO_OPTS = { pitch: 5, animate: true, frameMs: 120, srcW: 420, srcH: 280, fadeX: 0.1 } as const;
const KIND_LABEL = {
  prereq: 'Suggested: strengthen a prerequisite',
  review: 'Suggested: revision',
  next: 'Suggested: next topic',
  continue: 'Suggested: continue',
  refresh: 'Suggested: refresh',
} as const;

export function DashboardPage() {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const d = useLearner();
  const courses = useCourses();
  const profile = useApp((s) => s.profile);
  const minutes = useApp((s) => s.minutes);
  const lastTopic = useApp((s) => s.lastTopic);
  const activity = useApp((s) => s.activity);
  usePageMotion(root, [courses.length]);

  const now = useMemo(() => new Date(), []);
  const first = (profile.name || 'there').split(' ')[0];
  const hr = now.getHours();
  const greet =
    hr < 5 ? 'Late night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const c = courses[0];

  const head = (
    <div className="ph rv">
      <div>
        <div className="label">
          {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <h1 style={{ marginTop: 10 }}>{`${greet}, ${first}.`}</h1>
        <p className="sub">
          {courses.length
            ? 'Here is where your learning stands. Every number below is an estimate from your own answers.'
            : 'Your workspace is empty. Add a course to see the map, lessons and estimates.'}
        </p>
      </div>
      <div className="acts">
        <Link href="/app/upload" className="btn">
          <Icon name="upload" size={15} />
          Upload syllabus
        </Link>
        {c ? (
          <Link href={`/classroom/${c.id}/${lastTopic[c.id] ?? c.order[0]}`} className="btn solid">
            <Icon name="cube" size={15} />
            Enter classroom
          </Link>
        ) : null}
      </div>
    </div>
  );

  if (!c) {
    const tiles: [IconName, string, string][] = [
      [
        'upload',
        'Upload',
        'Drop a text, Markdown, PDF or Word outline, or paste it in.',
      ],
      [
        'graph',
        'Review the map',
        'Check units, topics and prerequisites. Inferred links are marked so you can accept or reject them.',
      ],
      [
        'cube',
        'Learn in 3D',
        'Open any lesson in the classroom and follow the slides on the screen.',
      ],
    ];
    return (
      <div className="page" ref={root}>
        {head}
        <EmptyWorkspace />
        <div className="g3">
          {tiles.map(([ic, t, b]) => (
            <div className="card rv" key={t}>
              <Icon name={ic} size={22} />
              <h3>{t}</h3>
              <p className="small">{b}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const rec = recommend(d, c);
  const rt = rec ? c.topics[rec.id] : null;
  const days = lastDays(minutes, 14);
  const goal = profile.minutesPerDay || 30;
  const counts = courseCounts(d, c);
  const queue = c.order
    .map((id) => ({ id, st: statusFor(d, id), m: masteryOf(d, id) }))
    .filter((r) => r.st === 'review' || (r.st === 'learning' && r.m.est < 0.6))
    .sort((a, b) => a.m.est - b.m.est)
    .slice(0, 4);

  return (
    <div className="page" ref={root}>
      {head}
      <div className="hero-card rv">
        <div className="txt">
          <div className="label">{rec ? KIND_LABEL[rec.kind] : 'Continue'}</div>
          <h2>{rt && rec ? topicTitle(d, c, rec.id) : c.title}</h2>
          {rec ? <p className="small">{rec.reason}</p> : null}
          {rt && rec ? (
            <div className="row wrap-r">
              <Link href={`/app/courses/${c.id}/topics/${rec.id}`} className="btn solid">
                <Icon name="book" size={15} />
                Open lesson
              </Link>
              <Link href={`/classroom/${c.id}/${rec.id}`} className="btn">
                <Icon name="cube" size={15} />
                In the classroom
              </Link>
              <Link href={`/app/courses/${c.id}/practice?topic=${rec.id}`} className="btn">
                Practise
              </Link>
            </div>
          ) : null}
          <div className="small" style={{ color: 'var(--fg3)' }}>
            How this was chosen: simple rules over your answers. It is a suggestion, not a verdict.
          </div>
        </div>
        <div className="art">
          <Halftone paint={paintClassroom} options={HERO_OPTS} label="Halftone classroom" />
        </div>
      </div>

      <div className="g4">
        <div className="stat rv">
          <span className="label">Streak</span>
          <div className="v">
            {streakDays(minutes)}
            <small>days</small>
          </div>
        </div>
        <div className="stat rv">
          <span className="label">This week</span>
          <div className="v">
            {weekMinutes(minutes)}
            <small>min</small>
          </div>
        </div>
        <div className="stat rv">
          <span className="label">Strong topics</span>
          <div className="v">
            {counts.mastered}
            <small>{`/ ${c.order.length}`}</small>
          </div>
        </div>
        <div className="stat rv">
          <span className="label">Course estimate</span>
          <div className="v">{Math.round(courseMastery(d, c) * 100)}%</div>
        </div>
      </div>

      <div className="g21">
        <div className="card rv">
          <div className="hd">
            <h2>Study time, last 14 days</h2>
            <span className="chip mono">Minutes</span>
          </div>
          <BarChart days={days} goal={goal} />
          <div className="legend">
            <span>
              <i style={{ background: 'var(--blue)' }} />
              Below goal
            </span>
            <span>
              <i style={{ background: 'var(--green)' }} />
              Goal met
            </span>
          </div>
        </div>
        <div className="card rv">
          <div className="hd">
            <h2>Revision queue</h2>
          </div>
          {queue.length ? (
            <div className="list">
              {queue.map((r) => (
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
                    <div className="s">{`${Math.round(r.m.est * 100)}% estimate · ${r.m.att} attempt${r.m.att === 1 ? '' : 's'}`}</div>
                  </div>
                  <StatusChip status={r.st} />
                </div>
              ))}
            </div>
          ) : (
            <p className="small">
              Nothing needs revision right now. Practise a topic and anything shaky will show up here.
            </p>
          )}
        </div>
      </div>

      <div className="ph">
        <h2 className="h3">Your courses</h2>
      </div>
      <div className="g3">
        {courses.map((cr) => (
          <CourseCard key={cr.id} course={cr} />
        ))}
        <Link
          href="/app/upload"
          className="card"
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            borderStyle: 'dashed',
            minHeight: 200,
            color: 'var(--fg2)',
          }}
        >
          <Icon name="plus" size={22} />
          <span>Add a course</span>
        </Link>
      </div>

      <div className="card rv">
        <div className="hd">
          <h2>Recent activity</h2>
        </div>
        {activity.length ? (
          <div className="list">
            {activity.slice(0, 5).map((a) => {
              const row = (
                <>
                  <div className="ico">
                    <Icon
                      name={a.type === 'practice' ? 'target' : a.type === 'upload' ? 'upload' : 'book'}
                      size={16}
                    />
                  </div>
                  <div className="grow">
                    <div className="t">{a.text}</div>
                    <div className="s">{ago(a.ts)}</div>
                  </div>
                </>
              );
              return a.link ? (
                <Link key={a.id} href={a.link} className="li link">
                  {row}
                </Link>
              ) : (
                <div key={a.id} className="li">
                  {row}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="small">Nothing yet.</p>
        )}
      </div>
      <UsageCard />
      <AdSlot place="dashboard" height={120} />
    </div>
  );
}
