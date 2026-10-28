'use client';

import Link from 'next/link';
import { CourseCover } from '@/components/app/CourseCover';
import { ProgressBar } from '@/components/ui/controls';
import { courseCounts, courseMastery } from '@/lib/domain/courses';
import type { Course } from '@/lib/domain/types';
import { useLearner } from '@/lib/store/hooks';
import { courseSubject, smartTitle } from '@/lib/course-identity';

export function CourseCard({ course: c }: { course: Course }) {
  const d = useLearner();
  const m = courseMastery(d, c);
  const counts = courseCounts(d, c);
  const look = courseSubject(c);
  const title = smartTitle(c);
  return (
    <Link href={`/app/courses/${c.id}`} className="course-card">
      <div className="art">
        <CourseCover look={look} seed={c.id} />
      </div>
      <div className="bd">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="chip mono">{look.id === 'general' ? 'Syllabus' : look.label}</span>
          <span className="label">{c.order.length} topics</span>
        </div>
        <h3>{title}</h3>
        <p className="small">{c.subtitle}</p>
        <ProgressBar value={m} className="blue" />
        <div className="row small" style={{ flexWrap: 'wrap', gap: '4px 12px' }}>
          <span>{Math.round(m * 100)}% estimate</span>
          <span className="dim">
            {counts.mastered} strong · {counts.review} to revise
          </span>
        </div>
      </div>
    </Link>
  );
}
