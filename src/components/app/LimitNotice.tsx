'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { ApiFail } from '@/lib/api/client';

const TITLES: Record<string, string> = {
  account_blocked: 'Your account is paused',
  vpn_blocked: 'Turn off your VPN or proxy',
  session_limit: 'Your next free lesson is not open yet',
  quota_exceeded: 'You have reached today’s limit',
  addon_required: 'This is an add-on',
  plan_required: 'This is part of Beta',
  email_unverified: 'Confirm your email first',
  unauthenticated: 'Sign in to continue',
  network: 'You seem to be offline',
  ai_not_configured: 'Lessons are not available yet',
  byok_rejected: 'Your AI key was refused',
  byok_failed: 'Your AI provider could not answer',
  byok_rate_limited: 'Your AI provider is busy',
};

/** One place that explains every "no" the server can give, with the next step. Never colour alone: icon and heading carry the meaning. */
export function LimitNotice({ error, onRetry }: { error: ApiFail; onRetry?: () => void }) {
  const retryAt = typeof error.extra.retryAt === 'number' ? new Date(error.extra.retryAt) : null;
  const appeal = typeof error.extra.appeal === 'string' ? error.extra.appeal : 'support@worklabxc.com';
  return (
    <div className="callout warn" role="alert">
      <Icon name={error.code === 'network' ? 'refresh' : 'lock'} size={18} />
      <div>
        <b>{TITLES[error.code] ?? 'We could not do that'}</b>
        <p className="body" style={{ margin: '4px 0 8px' }}>
          {error.message}
        </p>
        {retryAt ? <p className="small">Opens {retryAt.toLocaleString()}.</p> : null}
        <div className="row wrap-r" style={{ gap: 8 }}>
          {error.extra.upgrade || error.code === 'quota_exceeded' ? (
            <Link className="btn solid sm" href="/pricing">
              See plans
            </Link>
          ) : null}
          {[
            'quota_exceeded',
            'plan_required',
            'addon_required',
            'session_limit',
            'byok_rejected',
            'byok_failed',
            'byok_rate_limited',
          ].includes(error.code) ? (
            <Link className="btn sm" href="/app/settings#your-own-ai-key">
              {error.code.startsWith('byok') ? 'Check my AI key' : 'Or use your own AI key'}
            </Link>
          ) : null}
          {error.code === 'addon_required' ? (
            <Link className="btn solid sm" href="/app/learn#addons">
              Get the add-on
            </Link>
          ) : null}
          {error.code === 'unauthenticated' ? (
            <Link className="btn solid sm" href="/login">
              Sign in
            </Link>
          ) : null}
          {error.code === 'vpn_blocked' || error.code === 'account_blocked' ? (
            <a className="btn sm" href={`mailto:${appeal}`}>
              Contact support
            </a>
          ) : null}
          {onRetry && (error.code === 'network' || error.code === 'vpn_blocked') ? (
            <button className="btn sm" type="button" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
