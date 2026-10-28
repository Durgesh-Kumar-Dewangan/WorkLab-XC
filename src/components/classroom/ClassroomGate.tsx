'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp, useHydrated } from '@/lib/store';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useServerMe } from '@/hooks/useServerMe';
import { useServerSync } from '@/lib/api/sync';
import { api, ApiFail } from '@/lib/api/client';

/** Same sign-in gate as the workspace shell, without the sidebar chrome. Waits until the learner's courses are loaded. */
export function ClassroomGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const session = useApp((s) => s.session);
  const sync = useServerSync();
  const { me } = useServerMe();
  // Free accounts get a set number of classroom topics a month; opening one records it, and re-opening it is free
  const [entry, setEntry] = useState<'idle' | 'ok' | 'blocked' | 'error'>('idle');
  const [, cid, tid] = path.split('/').filter(Boolean);
  const needsEntry = !!me && !me.limits.classroom && (me.limits.classroomPerMonth ?? 0) > 0 && !!cid && !!tid;
  useEffect(() => {
    if (!needsEntry) return;
    let live = true;
    api('/classroom/enter', { body: { courseId: cid, topicId: tid } })
      .then(() => live && setEntry('ok'))
      .catch((e) => live && setEntry(e instanceof ApiFail && e.status === 429 ? 'blocked' : 'error'));
    return () => {
      live = false;
    };
  }, [needsEntry, cid, tid]);
  useEffect(() => {
    if (hydrated && !session) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [hydrated, session, path, router]);
  if (!hydrated || !session || sync.status === 'idle' || sync.status === 'loading')
    return <div className="cr" aria-busy="true" />;
  if (sync.status === 'error')
    return (
      <div className="cr" role="alert" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="empty">
          <h2 className="h3">We could not load your workspace</h2>
          <p className="body">{sync.error}</p>
          <button className="btn solid" type="button" onClick={sync.retry}>
            Try again
          </button>
        </div>
      </div>
    );
  // the 3D classroom is part of the Beta plan; Free learners study the same lesson in the lesson view
  if (!me) return <div className="cr" aria-busy="true" />;
  if (needsEntry && entry === 'idle') return <div className="cr" aria-busy="true" />;
  if (!me.limits.classroom && !(needsEntry && entry === 'ok')) {
    const used = needsEntry && entry === 'blocked';
    return (
      <div className="cr" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="empty" style={{ maxWidth: 520 }}>
          <Icon name="cube" size={26} />
          <h1 className="h3">{used ? 'You have used this month’s free classroom session' : 'The 3D classroom is part of Beta'}</h1>
          <p className="body">
            {used
              ? 'Free includes one 3D classroom session a month, and it renews next month. You can still study this lesson in the lesson view, or get unlimited classroom sessions with Beta.'
              : 'Beta is the paid plan: the 3D classroom with its presentation screen and live boards, no ads, and PDF and Word syllabi. On Free you can study the same lesson in the lesson view.'}
          </p>
          <div className="row wrap-r">
            <Link href="/pricing" className="btn solid">
              See the Beta plan
            </Link>
            <Link href={cid && tid ? `/app/courses/${cid}/topics/${tid}` : '/app/courses'} className="btn">
              Open the lesson
            </Link>
            <Link href="/demo/classroom/n2" className="btn">
              See the sample classroom
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
