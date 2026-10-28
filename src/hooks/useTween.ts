'use client';

import { useEffect, useRef, useState } from 'react';
import { ease, lerp, prefersReducedMotion } from '@/lib/util';

/** Animates a number toward `target` over `ms` with ease-in-out; snaps when motion is reduced. */
export function useTween(target: number, ms = 750): number {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    if (from === target) return;
    if (prefersReducedMotion() || ms <= 0) {
      cur.current = target;
      setV(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (n: number) => {
      const k = Math.min(1, (n - t0) / ms);
      cur.current = lerp(from, target, ease(k));
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
