'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';

/**
 * Visitor analytics, off until you set a token. Both options are cookieless, so they need no consent banner and they never see a name or email:
 *  - NEXT_PUBLIC_CF_ANALYTICS_TOKEN: Cloudflare Web Analytics (free, no cookies; the token is in the Cloudflare dashboard under Web Analytics).
 *  - NEXT_PUBLIC_PLAUSIBLE_DOMAIN: Plausible (set it to your domain, for example worklabxc.com).
 * Signed-in pages (the app, the classroom, exams) are left out on purpose: product activity there is tracked on your own server, never by a third party.
 */
export function Analytics() {
  const path = usePathname() || '';
  const cf = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN;
  const pl = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if ((!cf && !pl) || /^\/(app|classroom|exam)(\/|$)/.test(path)) return null;
  return (
    <>
      {cf ? (
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon={JSON.stringify({ token: cf, spa: true })}
        />
      ) : null}
      {pl ? (
        <Script src="https://plausible.io/js/script.js" strategy="afterInteractive" data-domain={pl} defer />
      ) : null}
    </>
  );
}
