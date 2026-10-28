'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { motionOK } from '@/lib/fx/motion';

/** Thin progress line on navigation. */
export function RouteBar() {
  const path = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !motionOK()) return;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }, [path]);
  return <div ref={ref} className="routebar" aria-hidden="true" />;
}
