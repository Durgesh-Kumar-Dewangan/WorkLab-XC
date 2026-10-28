'use client';

import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '@/components/ui/Logo';
import { scramble } from '@/lib/fx/scramble';
import { prefersReducedMotion } from '@/lib/util';

/** Logo reveal, once per tab session. */
export function IntroReveal() {
  const [phase, setPhase] = useState<'off' | 'in' | 'out'>('off');
  const word = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem('wlxc.intro') === '1';
      sessionStorage.setItem('wlxc.intro', '1');
    } catch {
      /* ignore */
    }
    if (seen || prefersReducedMotion()) return;
    setPhase('in');
    const cancel = word.current ? scramble(word.current, 'WorkLab XC', 700) : () => {};
    const t1 = setTimeout(() => setPhase('out'), 1100);
    const t2 = setTimeout(() => setPhase('off'), 1650);
    return () => {
      cancel();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (phase === 'off') return null;
  return (
    <div className={phase === 'out' ? 'intro out' : 'intro'} aria-hidden="true">
      <div className="intro-in">
        <LogoMark size={44} />
        <span className="intro-w" ref={word}>
          WorkLab XC
        </span>
      </div>
    </div>
  );
}
