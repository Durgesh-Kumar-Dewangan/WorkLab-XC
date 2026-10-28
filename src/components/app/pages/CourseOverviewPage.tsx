'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar, StatusChip } from '@/components/ui/controls';
import { CourseMissing } from '@/components/app/EmptyWorkspace';
import {
  courseCounts,
  courseEdges,
  courseMastery,
  masteryOf,
  recommend,
  statusFor,
  topicTitle,
  weakPrereqs,
} from '@/lib/domain/courses';
import { useCourse, useLearner } from '@/lib/store/hooks';

export function CourseOverviewPage({ cid }: { cid: string }) {
  const d = useLearner();
  const c = useCourse(cid);
  if (!c) return <CourseMissing />;
  const rec = recommend(d, c);
  const counts = courseCounts(d, c);
  const edges = courseEdges(d, c);
  const edgesN = edges.filter((e) => e.type !== 'rel').length;
  const inferred = edges.filter((e) => e.status === 'inferred').length;

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Course</div>
          <h1 style={{ marginTop: 8 }}>{c.title}</h1>
          <p className="sub">{`${c.subtitle}. Source: ${c.sourceName}.`}</p>
        </div>
        <div className="acts">
          <Link href={`/app/courses/${c.id}/graph`} className="btn">
            <Icon name="graph" size={15} />
            Knowledge graph
          </Link>
          <Link href={`/app/courses/${c.id}/practice`} className="btn">
            <Icon name="target" size={15} />
            Practise
          </Link>
          {rec ? (
            <Link href={`/classroom/${c.id}/${rec.id}`} className="btn solid">
              <Icon name="cube" size={15} />
              Enter classroom
            </Link>
          ) : null}
        </div>
      </div>

      {c.template ? (
        <div className="callout warn">
          <Icon name="info" size={18} />
          <span>
            Each topic’s lesson is written the first time you open it. Until then it shows only the heading from
            your syllabus. Prerequisites that come from the order of the syllabus are marked as inferred, so you
            can confirm or remove them.
          </span>
        </div>
      ) : null}

      <div className="g4">
        <div className="stat">
          <span className="label">Topics</span>
          <div className="v">{c.order.length}</div>
        </div>
        <div className="stat">
          <span className="label">Course estimate</span>
          <div className="v">{Math.round(courseMastery(d, c) * 100)}%</div>
        </div>
        <div className="stat">
          <span className="label">Strong / to revise</span>
          <div className="v">{`${counts.mastered} / ${counts.review}`}</div>
        </div>
        <div className="stat">
          <span className="label">Links</span>
          <div className="v">
            {edgesN}
            <small>{inferred ? `${inferred} inferred` : 'all confirmed'}</small>
          </div>
        </div>
      </div>

      {rec ? (
        <div className="callout">
          <Icon name="sparkles" size={18} />
          <span>
            <b>Suggested next: </b>
            <Link href={`/app/courses/${c.id}/topics/${rec.id}`} style={{ textDecoration: 'underline' }}>
              {topicTitle(d, c, rec.id)}
            </Link>
            {'. '}
            {rec.reason}
          </span>
        </div>
      ) : null}

      {c.units.map((u) => {
        const avg = u.topics.length
          ? u.topics.reduce((s, id) => s + (masteryOf(d, id).est || 0), 0) / u.topics.length
          : 0;
        return (
          <section className="card" key={u.id} aria-label={u.title}>
            <div className="hd">
              <div>
                <div className="label">{'Unit' + (u.page ? ` · from page ${u.page}` : '')}</div>
                <h2 style={{ marginTop: 4 }}>{u.title}</h2>
              </div>
              <div style={{ width: 120 }}>
                <ProgressBar value={avg} className="blue" />
                <div className="small" style={{ textAlign: 'right', marginTop: 4 }}>
                  {Math.round(avg * 100)}%
                </div>
              </div>
            </div>
            <div className="list">
              {u.topics.map((id) => {
                const t = c.topics[id];
                const st = statusFor(d, id);
                const wp = weakPrereqs(d, c, id);
                return (
                  <div className="li" key={id}>
                    <div className="ico">
                      <Icon
                        name={
                          st === 'mastered'
                            ? 'check'
                            : st === 'new'
                              ? 'book'
                              : st === 'review'
                                ? 'refresh'
                                : 'trend'
                        }
                        size={16}
                      />
                    </div>
                    <div className="grow">
                      <Link
                        href={`/app/courses/${c.id}/topics/${id}`}
                        className="t"
                        style={{ display: 'block' }}
                      >
                        {topicTitle(d, c, id)}
                      </Link>
                      <div className="s">
                        {`${t.mins} min` +
                          (t.page ? ` · page ${t.page}` : '') +
                          (wp.length && st === 'new'
                            ? ` · builds on ${wp.map((w) => topicTitle(d, c, w)).join(', ')}`
                            : '') +
                          (t.uncertain ? ' · uncertain extraction' : '')}
                      </div>
                    </div>
                    <StatusChip status={st} />
                    <Link
                      href={`/classroom/${c.id}/${id}`}
                      className="btn xs hide-s"
                      aria-label={`Open ${topicTitle(d, c, id)} in the classroom`}
                    >
                      Classroom
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
