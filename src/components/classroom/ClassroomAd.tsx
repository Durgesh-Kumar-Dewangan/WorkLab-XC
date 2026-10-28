'use client';

import { useEffect, useState } from 'react';
import { AdSlot } from '@/components/ads/AdSlot';
import type { ClassroomSnapshot } from '@/lib/classroom/controller';

/**
 * The classroom's banner for free accounts. It sits in the bottom-left corner, beside the controls and clear of the board, and on a
 * narrow screen it only appears while the lesson is paused, so it never covers the lesson or interrupts it. The learner can hide it
 * for the visit; it renders nothing at all when there is no ad to show.
 */
export function ClassroomAd({ snap, demo }: { snap: ClassroomSnapshot; demo: boolean }) {
  const [vw, setVw] = useState(1200);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  if (demo || hidden || snap.intro || snap.game) return null;
  if (vw < 1200 && snap.playing) return null;
  return (
    <div className="cr-ad">
      <AdSlot place="classroom" height={90} />
      <button type="button" className="cr-ad-x" aria-label="Hide this ad for now" onClick={() => setHidden(true)}>
        ×
      </button>
    </div>
  );
}
