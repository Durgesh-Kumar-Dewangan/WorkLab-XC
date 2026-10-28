'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiFail, hasBackend, type Me } from '@/lib/api/client';
import { useApp } from '@/lib/store';

/** The signed-in account as the server sees it (plan, limits, admin flag). Null until loaded or when there is no server. */
export function useServerMe() {
  const signedIn = useApp((s) => !!s.session);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<ApiFail | null>(null);
  const load = useCallback(async () => {
    if (!hasBackend() || !signedIn) return;
    try {
      setMe(await api<Me>('/me'));
      setError(null);
    } catch (e) {
      setError(e as ApiFail);
    }
  }, [signedIn]);
  useEffect(() => {
    void load();
  }, [load]);
  return { me, error, reload: load };
}
