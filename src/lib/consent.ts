import { useSyncExternalStore } from 'react';

export type AdChoice = 'personalised' | 'basic';
const KEY = 'wlxc.ads.choice';
const listeners = new Set<() => void>();

export function readAdChoice(): AdChoice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'personalised' || v === 'basic' ? v : null;
  } catch {
    return null;
  }
}
export function setAdChoice(c: AdChoice): void {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* private mode: the choice lasts until the page closes */
  }
  listeners.forEach((l) => l());
}
/** The learner's ad choice. `null` until they have made one; no ad is shown before then. */
export function useAdChoice(): AdChoice | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener('storage', cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', cb);
      };
    },
    readAdChoice,
    () => null,
  );
}
