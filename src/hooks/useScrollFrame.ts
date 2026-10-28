'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { onFrame } from '@/lib/fx/scrollFrames';

/** Runs `fn` on scroll/resize (once per frame) while `gate` is near the viewport. */
export function useScrollFrame(fn: () => void, gate?: RefObject<Element | null>) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => onFrame(() => ref.current(), gate?.current ?? null), [gate]);
}
