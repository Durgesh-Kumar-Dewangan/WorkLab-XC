'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { usePlans } from '@/hooks/usePlans';
import { useServerMe } from '@/hooks/useServerMe';
import { API } from '@/lib/config';
import { money } from '@/lib/plans';

const WHAT: Record<string, string> = {
  classroom: 'classroom session',
  chat: 'tutor questions',
  notes: 'unit notes',
};

/** First day of next month, in India time: when the free monthly allowance starts again. */
function renewsOn(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const next = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1));
  return next.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * Shown on every page, on every visit, to a free account that has used up one of its monthly allowances, until the month turns over and the
 * allowance comes back. It names what ran out, says when it returns, and puts the plans and their prices right there.
 */
export function PlanNudge() {
  const { me } = useServerMe();
  const { plans, region } = usePlans();
  const [open, setOpen] = useState(false);
  if (!me || me.user.plan !== 'prototype' || me.user.byok || !me.month) return null;
  const spent = (['classroom', 'chat', 'notes'] as const).filter((k) => {
    const m = me.month?.[k];
    return m && m[1] > 0 && m[0] >= m[1];
  });
  if (!spent.length) return null;
  const paid = plans.filter((p) => p.id === 'learner' || p.id === 'plus');
  return (
    <section className="pn" aria-label="Plans and pricing">
      <div className="pn-bar">
        <Icon name="sparkles" size={16} />
        <span>
          <b>{`You have used this month's free ${spent.map((k) => WHAT[k]).join(' and ')}.`}</b>{' '}
          {`They come back on ${renewsOn()}. Or keep going now with a plan.`}
        </span>
        <button
          className="btn xs solid"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide plans' : 'See plans and prices'}
        </button>
        <Link className="btn xs" href="/app/settings#your-own-ai-key">
          Use your own AI key
        </Link>
      </div>
      {open ? (
        <div className="pn-plans">
          {paid.map((p) => (
            <div key={p.id} className="pn-card">
              <b>{p.name}</b>
              <span className="pn-price">
                {typeof p.price === 'number' ? `${API.currency}${money(p.price)}` : 'Soon'}
                <small> / month</small>
              </span>
              <ul>
                {p.items.slice(0, 4).map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
              <Link className="btn xs solid" href={`/pricing?buy=${p.id}:month`}>
                Choose {p.name}
              </Link>
            </div>
          ))}
          <p className="small pn-note">
            {region.country ? `Prices for ${region.name || region.country}. ` : ''}Pay monthly or yearly.
            Cancel any time in Settings.
          </p>
        </div>
      ) : null}
    </section>
  );
}
