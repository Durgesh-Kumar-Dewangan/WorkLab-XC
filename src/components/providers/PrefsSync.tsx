'use client';

import { applyCustom } from '@/lib/themes';
import { useEffect } from 'react';
import { useApp, useHydrated } from '@/lib/store';
import { installCardSpotlight } from '@/lib/fx/motion';

/** Rehydrates the persisted store once, then mirrors preferences onto <html> data attributes. */
export function PrefsSync() {
  const hydrated = useHydrated();
  const theme = useApp((s) => s.theme);
  const motion = useApp((s) => s.settings.motion);
  const textSize = useApp((s) => s.settings.textSize);
  const custom = useApp((s) => s.settings.custom);
  const themedElements = useApp((s) => s.settings.themedElements !== false);
  const halftone = useApp((s) => s.settings.halftone);
  const scenicTone = useApp((s) => s.settings.scenicTone);

  useEffect(() => {
    void useApp.persist?.rehydrate?.();
    return installCardSpotlight();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const r = document.documentElement;
    if (theme && theme !== 'system') r.dataset.theme = theme;
    else delete r.dataset.theme;
    if (motion === 'off') r.dataset.motion = 'off';
    else delete r.dataset.motion;
    if (textSize === 'large' || textSize === 'small') r.dataset.text = textSize;
    else delete r.dataset.text;
    r.dataset.halftone = halftone ? 'on' : 'off';
    if (scenicTone && scenicTone !== 'dusk') r.dataset.tone = scenicTone;
    else delete r.dataset.tone;
    applyCustom(custom);
    if (themedElements) r.dataset.skin = 'on';
    else delete r.dataset.skin;
    window.dispatchEvent(new Event('themechange'));
  }, [hydrated, theme, motion, textSize, halftone, custom, themedElements, scenicTone]);

  return null;
}
