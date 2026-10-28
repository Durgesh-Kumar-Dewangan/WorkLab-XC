'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp, useHydrated } from '@/lib/store';

/**
 * A learner who is signed in goes straight to their workspace when they open the home page, so they stay where their work is.
 * The sign-in lasts 30 days on this device. "Back to the website" in the account menu opens the home page with ?site=1 to stay on it.
 */
export function HomeRedirect() {
  const router = useRouter();
  const hydrated = useHydrated();
  const signedIn = useApp((s) => !!s.session);
  useEffect(() => {
    if (!hydrated || !signedIn) return;
    if (new URLSearchParams(window.location.search).has('site')) return;
    router.replace('/app');
  }, [hydrated, signedIn, router]);
  return null;
}
