'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { CoursesPage } from '@/components/app/pages/CoursesPage';
import { LearnPage } from '@/components/app/pages/LearnPage';

const VIEWS = [
  ['courses', 'My courses'],
  ['path', 'Learning path'],
] as const;

/** Learn is one place: the list of courses first, and the path through every topic behind it. */
export function LearnHub() {
  const q = useSearchParams();
  const router = useRouter();
  const view = q.get('view') === 'path' ? 'path' : 'courses';
  const go = useCallback(
    (v: string) => router.replace(v === 'courses' ? '/app/learn' : `/app/learn?view=${v}`, { scroll: false }),
    [router],
  );
  return (
    <>
      <div className="lh-tabs" role="tablist" aria-label="Learn">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={clsx(view === id && 'on')}
            onClick={() => go(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'courses' ? <CoursesPage /> : <LearnPage />}
    </>
  );
}
