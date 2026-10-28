'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFail } from '@/lib/api/client';
import { writeLesson } from '@/lib/api/lesson';
import { useCourse } from '@/lib/store/hooks';

export type LessonState =
  | { status: 'ready' }
  | { status: 'writing' }
  | { status: 'failed'; error: ApiFail; retry: () => void };

/** Makes sure a topic has a real lesson. Topics from a new syllabus are written by the server the first time they are opened. */
export function useLesson(cid: string, tid: string): LessonState {
  const course = useCourse(cid);
  const topic = course?.topics[tid];
  const ai = !!topic?.ai;
  const [error, setError] = useState<ApiFail | null>(null);
  const running = useRef('');

  const run = useCallback(() => {
    if (!course || ai || running.current === `${cid}/${tid}`) return;
    running.current = `${cid}/${tid}`;
    setError(null);
    writeLesson(course, tid)
      .catch((e) => setError(e instanceof ApiFail ? e : new ApiFail(0, 'error', 'The lesson could not be written. Try again.')))
      .finally(() => {
        running.current = '';
      });
  }, [course, ai, cid, tid]);

  useEffect(() => {
    if (topic && !ai && !error) run();
  }, [topic, ai, error, run]);

  if (ai || !topic) return { status: 'ready' };
  if (error) return { status: 'failed', error, retry: () => { setError(null); running.current = ''; run(); } };
  return { status: 'writing' };
}
