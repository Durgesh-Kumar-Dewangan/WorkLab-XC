'use client';

import { useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useApp } from '@/lib/store';
import { prefersReducedMotion } from '@/lib/util';

/**
 * Sends a signed-in learner straight to `next`. A visitor who is only exploring goes to the public demo instead of being
 * pushed to sign-in; pages that truly need an account link to /register themselves.
 */
export function useStart() {
  const router = useRouter();
  const signedIn = useApp((s) => !!s.session);
  return useCallback(
    (next = '/app') => {
      router.push(signedIn ? next : '/demo');
    },
    [router, signedIn],
  );
}

/** Scroll to a landing-page section id, navigating home first when needed. */
export function useGoSection() {
  const router = useRouter();
  const path = usePathname();
  return useCallback(
    (id: string) => {
      const go = () =>
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      if (path !== '/') {
        router.push('/');
        setTimeout(go, 160);
      } else go();
    },
    [path, router],
  );
}
