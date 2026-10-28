'use client';

import Link from 'next/link';
import { setAdChoice, useAdChoice } from '@/lib/consent';

/**
 * Essential cookies keep you signed in. Free accounts also see Google AdSense ads, so the notice asks for a real choice:
 * basic ads, or ads personalised with advertising cookies. No ad is shown until one is picked.
 */
export function CookieNotice() {
  const choice = useAdChoice();
  if (choice) return null;
  return (
    <div className="cookie-bar" role="region" aria-label="Cookie and ads choice">
      <p className="small" style={{ margin: 0 }}>
        We use cookies to keep you signed in and remember your settings. Free accounts also see ads. You choose whether they are
        personalised using advertising cookies. You can change this any time in Settings.{' '}
        <Link href="/cookies">Read the cookie notice</Link>.
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn sm" type="button" onClick={() => setAdChoice('basic')}>
          Basic ads only
        </button>
        <button className="btn solid sm" type="button" onClick={() => setAdChoice('personalised')}>
          Allow personalised ads
        </button>
      </div>
    </div>
  );
}
