'use client';

import { useEffect, useRef } from 'react';
import { useServerMe } from '@/hooks/useServerMe';
import { useAdChoice } from '@/lib/consent';

/**
 * A Google AdSense slot for free-plan learners. It renders nothing unless AdSense is configured
 * (NEXT_PUBLIC_ADSENSE_CLIENT and a slot id) and the signed-in account is on the free plan, so paid learners, visitors and
 * un-configured installs never see an empty box. The slot has a fixed height, so a loading ad never shifts the page.
 */
const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '';
const SLOTS = {
  dashboard: process.env.NEXT_PUBLIC_ADSENSE_SLOT_DASHBOARD ?? '',
  lesson: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LESSON ?? '',
  panel: process.env.NEXT_PUBLIC_ADSENSE_SLOT_PANEL ?? '',
  /** A slim banner in a corner of the classroom, never over the board. */
  classroom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_CLASSROOM ?? '',
  /** A rectangle on the lesson-complete screen, where the learner has stopped. */
  finish: process.env.NEXT_PUBLIC_ADSENSE_SLOT_FINISH ?? '',
} as const;
export type AdPlace = keyof typeof SLOTS;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let scriptAdded = false;
function loadScript() {
  if (scriptAdded || typeof document === 'undefined') return;
  scriptAdded = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CLIENT)}`;
  document.head.appendChild(s);
}

export function AdSlot({ place, height = 250 }: { place: AdPlace; height?: number }) {
  const { me } = useServerMe();
  const choice = useAdChoice();
  const slot = SLOTS[place];
  // no ad until the learner has chosen basic or personalised ads
  // shown only while the account has ads: the free plan, unless the Ad-free add-on is active
  const show = !!CLIENT && !!slot && !!me?.limits?.ads && choice !== null;
  const pushed = useRef(false);

  useEffect(() => {
    if (!show || pushed.current) return;
    pushed.current = true;
    loadScript();
    try {
      const q = (window.adsbygoogle = window.adsbygoogle || []) as unknown[] & { requestNonPersonalizedAds?: number };
      q.requestNonPersonalizedAds = choice === 'personalised' ? 0 : 1;
      q.push({});
    } catch {
      /* an ad blocker or a blocked script must never break the page */
    }
  }, [show, choice]);

  if (!show) return null;
  return (
    <aside className="adslot" aria-label="Advertisement" style={{ minHeight: height + 28 }}>
      <span className="adslot-label">Advertisement</span>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: height }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
        {...(process.env.NEXT_PUBLIC_ADSENSE_TEST === '1' ? { 'data-adtest': 'on' } : {})}
      />
    </aside>
  );
}
