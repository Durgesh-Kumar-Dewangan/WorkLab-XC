'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export function EmptyWorkspace() {
  return (
    <div className="empty">
      <Icon name="upload" size={26} />
      <h3 className="h3">Start with a syllabus</h3>
      <p className="body">
        Upload an outline or paste one in. WorkLab XC turns the headings into a course map of units, topics and
        prerequisites, then writes lessons for each topic.
      </p>
      <div className="row wrap-r">
        <Link href="/app/upload" className="btn solid">
          <Icon name="upload" size={16} />
          Upload a syllabus
        </Link>
      </div>
    </div>
  );
}

export function CourseMissing() {
  return (
    <div className="page">
      <div className="empty">
        <Icon name="search" size={24} />
        <h2 className="h3">That course is not here</h2>
        <p className="body">
          It may have been deleted, or it belongs to a different account.
        </p>
        <div className="row wrap-r">
          <Link href="/app/courses" className="btn solid">
            See your courses
          </Link>
        </div>
      </div>
    </div>
  );
}
