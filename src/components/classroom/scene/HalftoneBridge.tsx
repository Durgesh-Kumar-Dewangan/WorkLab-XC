'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { renderDots, type HalftoneCanvas } from '@/lib/fx/halftone';

/**
 * Halftone view: every third frame the rendered scene is downsampled to 320×180 and redrawn as dots onto an
 * overlay canvas. A positive-priority useFrame takes over R3F's render loop, so it renders the scene itself.
 */
export function HalftoneBridge({ overlay }: { overlay: RefObject<HalftoneCanvas | null> }) {
  const size = useThree((s) => s.size);
  const src = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    return { c, ctx: c.getContext('2d')! };
  }, []);

  useEffect(() => {
    const o = overlay.current;
    if (!o) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    o._dpr = dpr;
    o.width = Math.round(size.width * dpr);
    o.height = Math.round(size.height * dpr);
  }, [overlay, size.width, size.height]);

  const n = useRef(0);
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, camera);
    const o = overlay.current;
    if (!o || n.current++ % 3 !== 0) return;
    try {
      src.ctx.drawImage(gl.domElement, 0, 0, 320, 180);
      renderDots(o, src.c, { pitch: 6, gamma: 0.9, cut: 0.06, fadeX: 0, color: '#ffffff' });
    } catch {
      /* the canvas can be momentarily unreadable while resizing */
    }
  }, 1);
  return null;
}
