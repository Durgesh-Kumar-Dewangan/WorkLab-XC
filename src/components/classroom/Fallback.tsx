'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { drawSim2D } from '@/lib/domain/sim';
import { simPalette } from '@/components/app/SimPanel';
import type { ClassroomController, ClassroomSnapshot } from '@/lib/classroom/controller';
import { slideProgress } from '@/lib/classroom/timeline';
import { clamp } from '@/lib/util';

/** 2D stand-in when WebGL is missing or the 3D scene fails. Owns the animation loop because no R3F driver is running. */
export function Fallback({
  ctrl,
  snap,
  reason,
}: {
  ctrl: ClassroomController;
  snap: ClassroomSnapshot;
  reason: string;
}) {
  const cv = useRef<HTMLCanvasElement>(null);
  const s = ctrl.topic.slides[snap.idx];
  const p = slideProgress(ctrl.tl, snap.t, snap.idx);
  const n = s.b.length;

  useEffect(() => {
    const el = cv.current;
    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;
    const ctx = el?.getContext('2d') ?? null;
    const size = () => {
      if (!el || !ctx) return;
      const r = el.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(r.width * d);
      el.height = Math.round(r.height * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      w = r.width;
      h = r.height;
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      ctrl.tick(dt);
      if (ctrl.S && ctx && w) drawSim2D(ctrl.S, ctx, w, h, simPalette());
    };
    size();
    window.addEventListener('resize', size);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [ctrl]);

  return (
    <div className="cr-fbwrap">
      <div className="callout warn">
        <Icon name="alert" size={18} />
        <span>
          <b>3D is not available here. </b>
          {`${reason} The lesson still plays with the board and model in 2D.`}
        </span>
      </div>
      <div className="cr-fb">
        <span className="label">{`Slide ${snap.idx + 1} of ${ctrl.topic.slides.length}`}</span>
        <h2 className="h2">{s.t}</h2>
        <ul className="bul">
          {s.b.map((b, i) => (
            <li key={i} style={{ opacity: clamp((p - (0.08 + i * (0.7 / n))) / 0.07, 0, 1) }}>
              {b}
            </li>
          ))}
        </ul>
        {s.f && p > 0.75 ? <div className="formula">{s.f}</div> : null}
      </div>
      {ctrl.S ? (
        <div className="simstage">
          <canvas
            ref={cv}
            className="simcanvas"
            style={{ height: 260 }}
            role="img"
            aria-label="Two-dimensional demonstration"
          />
        </div>
      ) : null}
    </div>
  );
}
