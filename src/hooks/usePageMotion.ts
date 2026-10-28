'use client';

import { useEffect, type RefObject } from 'react';
import { enhanceMotion } from '@/lib/fx/motion';

/** Applies entrance stagger, count-ups and bar growth inside `ref` once per mount. */
export function usePageMotion(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    if (ref.current) enhanceMotion(ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
