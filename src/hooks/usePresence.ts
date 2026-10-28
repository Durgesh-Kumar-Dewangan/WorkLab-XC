'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/store';
import { api } from '@/lib/api/client';

/** Tells the server this learner has the app open, once a minute while the tab is showing. Close the tab and they show as offline within three minutes. */
export function usePresence() {
  const signedIn = useApp((s) => !!s.session);
  useEffect(() => {
    if (!signedIn) return;
    const beat = () => {
      if (document.visibilityState === 'visible') void api('/presence', { body: {} }).catch(() => undefined);
    };
    beat();
    const id = setInterval(beat, 60_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [signedIn]);
}
