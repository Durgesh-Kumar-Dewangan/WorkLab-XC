'use client';

import { useSyncExternalStore } from 'react';
import { isDark } from '@/lib/util';

const subscribe = (cb: () => void) => {
  window.addEventListener('themechange', cb);
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener('change', cb);
  return () => {
    window.removeEventListener('themechange', cb);
    mq.removeEventListener('change', cb);
  };
};

export const useIsDark = () => useSyncExternalStore(subscribe, isDark, () => true);
