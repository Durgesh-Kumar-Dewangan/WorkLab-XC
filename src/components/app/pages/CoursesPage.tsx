'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { CourseCard } from '@/components/app/CourseCard';
import { PublicSyllabi } from '@/components/app/PublicSyllabi';
import { EmptyWorkspace } from '@/components/app/EmptyWorkspace';
import { useCourses } from '@/lib/store/hooks';

export function CoursesPage() {
  const cs = useCourses();
  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Courses</h1>
          <p className="sub">
            Every course you have added. Each one has a map of topics, lessons, practice and estimates.
          </p>
        </div>
        <div className="acts">
          <Link href="/app/upload" className="btn solid">
            <Icon name="upload" size={15} />
            Upload syllabus
          </Link>
        </div>
      </div>
      {cs.length ? (
        <div className="g3">
          {cs.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      ) : (
        <EmptyWorkspace />
      )}
      <PublicSyllabi />
    </div>
  );
}

export function PracticeIndexPage() {
  const cs = useCourses();
  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Practice</h1>
          <p className="sub">Pick a course for short question sets, or sit a full timed exam.</p>
        </div>
        <div className="acts">
          <Link href="/app/learn?view=path" className="btn">
            <Icon name="flame" size={15} />
            Play a quick round
          </Link>
          <Link href="/app/practice/exam" className="btn solid">
            <Icon name="target" size={15} />
            Exam practice
          </Link>
        </div>
      </div>
      {cs.length ? (
        <div className="g3">
          {cs.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      ) : (
        <EmptyWorkspace />
      )}
    </div>
  );
}
