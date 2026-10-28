'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import {
  makeHalftone,
  type HalftoneCanvas,
  type HalftoneHandle,
  type HalftoneOptions,
  type Painter,
} from '@/lib/fx/halftone';

interface Props {
  paint: Painter;
  options?: HalftoneOptions;
  className?: string;
  /** Accessible description; omit for purely decorative canvases. */
  label?: string;
  /** Changing this value forces an immediate redraw (e.g. when the painter's inputs change). */
  redrawKey?: unknown;
}

/** Canvas that renders a painter as a halftone dot image. Starts after mount and cleans up on unmount. */
export function Halftone({ paint, options, className, label, redrawKey }: Props) {
  const ref = useRef<HalftoneCanvas>(null);
  const handle = useRef<HalftoneHandle | null>(null);
  const paintRef = useRef(paint);
  const optRef = useRef(options);
  paintRef.current = paint;
  optRef.current = options;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const h = makeHalftone(c, (...a) => paintRef.current(...a), { ...optRef.current });
    handle.current = h;
    return () => {
      h.stop();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    handle.current?.redraw();
  }, [redrawKey]);

  return (
    <canvas
      ref={ref}
      className={clsx('halftone', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
