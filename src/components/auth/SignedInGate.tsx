'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useServerSync } from '@/lib/api/sync';
import { useApp, useHydrated } from '@/lib/store';

/** Full-screen pages (the exam window) that need a signed-in learner but not the workspace chrome. */
export function SignedInGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const session = useApp((s) => s.session);
  const sync = useServerSync();
  useEffect(() => {
    if (hydrated && !session) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [hydrated, session, path, router]);
  if (!hydrated || !session || sync.status === 'idle' || sync.status === 'loading')
    return <div className="ex-center" aria-busy="true" />;
  if (sync.status === 'error')
    return (
      <div className="ex-center" role="alert">
        <p className="body">{sync.error}</p>
        <button className="btn solid" type="button" onClick={sync.retry}>
          Try again
        </button>
      </div>
    );
  return <>{children}</>;
}
