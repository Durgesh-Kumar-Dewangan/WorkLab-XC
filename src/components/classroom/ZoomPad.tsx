'use client';

import { Icon } from '@/components/ui/Icon';
import type { ClassroomController } from '@/lib/classroom/controller';

/**
 * Zoom buttons that sit on the stage: closer, further, and "fit the screen". Pinching also zooms. The camera never goes
 * through the wall or too far away, and Fit always brings the whole screen back into view.
 */
export function ZoomPad({ ctrl }: { ctrl: ClassroomController }) {
  return (
    <div className="cr-zoom" role="group" aria-label="Zoom">
      <button type="button" className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => ctrl.zoom(0.7)}>
        <Icon name="zin" size={18} />
      </button>
      <button type="button" className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => ctrl.zoom(1.4)}>
        <Icon name="zout" size={18} />
      </button>
      <button type="button" className="icon-btn" aria-label="Fit the screen" title="Fit the screen" onClick={() => ctrl.fitScreen()}>
        <Icon name="max" size={18} />
      </button>
    </div>
  );
}
