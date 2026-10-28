'use client';

import { useEffect, useRef } from 'react';
import { ditherPanel, type DitherOptions } from '@/lib/fx/dither';

export function DitherPanel({
  options,
  className,
}: {
  options?: Partial<DitherOptions>;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const opt = useRef(options);
  opt.current = options;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => ditherPanel(c, opt.current);
    draw();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    ro?.observe(c);
    window.addEventListener('themechange', draw);
    return () => {
      ro?.disconnect();
      window.removeEventListener('themechange', draw);
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
