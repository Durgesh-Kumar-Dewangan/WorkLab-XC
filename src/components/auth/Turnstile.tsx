'use client';

import { useEffect, useRef } from 'react';
import { setTurnstileToken, turnstileSiteKey } from '@/lib/auth/turnstile';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
    __wlxcTurnstileReady?: () => void;
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/**
 * Cloudflare Turnstile, the "are you a person" check, shown on sign-up and sign-in when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 * It is almost always invisible to real people. Without the key nothing is shown and sign-in works as before.
 */
export function TurnstileBox() {
  const box = useRef<HTMLDivElement>(null);
  const key = turnstileSiteKey();
  useEffect(() => {
    if (!key || !box.current) return;
    let id = '';
    let dead = false;
    const mount = () => {
      if (dead || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, {
        sitekey: key,
        theme: 'auto',
        callback: (t: string) => setTurnstileToken(t),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    };
    if (window.turnstile) mount();
    else {
      let s = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
      if (!s) {
        s = document.createElement('script');
        s.src = SRC;
        s.async = true;
        s.dataset.turnstile = '1';
        document.head.appendChild(s);
      }
      s.addEventListener('load', mount);
    }
    return () => {
      dead = true;
      setTurnstileToken('');
      if (id) window.turnstile?.remove(id);
    };
  }, [key]);
  if (!key) return null;
  return <div ref={box} className="ts-box" aria-label="Security check" />;
}
