'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CourseMissing } from '@/components/app/EmptyWorkspace';
import { recommend } from '@/lib/domain/courses';
import { useCourse, useLearner } from '@/lib/store/hooks';

/** /classroom/[cid] → the recommended topic, or the first one in the course. */
export function ClassroomRedirect({ cid }: { cid: string }) {
  const d = useLearner();
  const c = useCourse(cid);
  const router = useRouter();
  const target = c ? (recommend(d, c)?.id ?? c.order[0]) : null;
  useEffect(() => {
    if (c && target) router.replace(`/classroom/${c.id}/${target}`);
  }, [c, target, router]);
  return c ? <div className="cr" aria-busy="true" /> : <CourseMissing />;
}
