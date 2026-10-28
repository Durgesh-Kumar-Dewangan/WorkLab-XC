'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Icon, Spinner } from '@/components/ui/Icon';
import { Segmented } from '@/components/ui/controls';
import { API } from '@/lib/config';
import { intentFromSearch, intentToPath, startBuying, type Billing, type Intent } from '@/lib/buy';
import { money, type Plan } from '@/lib/plans';
import { useApp, useHydrated } from '@/lib/store';
import { toast } from '@/lib/ui/toast';
import { useStart } from '@/hooks/useStart';
import { usePlans } from '@/hooks/usePlans';

/** One line on who each plan is for, so the choice takes seconds. */
const BEST_FOR: Record<string, string> = {
  prototype: 'Trying it out, or studying one subject',
  learner: 'Learners who want the 3D classroom, games, quizzes and exams',
  plus: 'Heavy learners who also want the tutor and unlimited notes',
};

/** Sends a visitor to sign in (or create an account) and back to what they were buying. */
export function useBuy() {
  const router = useRouter();
  const hydrated = useHydrated();
  const signedIn = useApp((s) => !!s.session) && hydrated;
  const [busy, setBusy] = useState('');
  const buy = useCallback(
    async (i: Intent, key: string) => {
      if (!signedIn) {
        router.push(`/register?next=${encodeURIComponent(intentToPath(i))}`);
        return;
      }
      setBusy(key);
      try {
        await startBuying(i);
      } catch (e) {
        toast((e as Error).message, 'err');
        setBusy('');
      }
    },
    [router, signedIn],
  );
  return { buy, busy, signedIn, hydrated };
}

const VIA: Record<string, string> = {
  network: 'Worked out from your network.',
  ip: 'Worked out from your network address.',
  timezone: "Worked out from your device's time zone.",
  account: 'From your account.',
  language: "Worked out from your device's language.",
  default: 'We could not tell where you are, so these are our standard prices.',
};

function PlanPrice({ p, billing }: { p: Plan; billing: Billing }) {
  const yr = billing === 'year' && typeof p.yearly === 'number';
  if (typeof p.price === 'number' && p.price > 0) {
    const v = yr ? Math.round(((p.yearly as number) / 12) * 100) / 100 : p.price;
    return (
      <div className="plan-p">
        {yr && p.yearlySavePct ? <s className="plan-was">{API.currency + money(p.price)}</s> : null}
        {!yr && p.listPrice ? <s className="plan-was">{API.currency + money(p.listPrice)}</s> : null}
        <b className="num">{API.currency + money(v)}</b>
        <span>/ month</span>
        <em>
          {yr
            ? `${API.currency}${money(p.yearly as number)} billed once a year`
            : `about ${API.currency}${money(Math.max(0.05, Math.round((p.price / 30) * 100) / 100))} a day, billed monthly`}
        </em>
        {yr && p.yearlySavePct ? (
          <i className="plan-save">{`Save ${p.yearlySavePct}% · ${API.currency}${money(p.yearlySaveInr as number)} a year`}</i>
        ) : null}
        {!yr && p.savePct ? (
          <i className="plan-save">{`Beta + Study pack bought apart: ${API.currency}${money(p.listPrice as number)}. You save ${p.savePct}% (${API.currency}${money(p.saveInr as number)} a month)`}</i>
        ) : null}
      </div>
    );
  }
  return (
    <div className="plan-p">
      <b className="num">{p.price === 0 ? `${API.currency}0` : p.priceLabel || '–'}</b>
      {p.price === 0 ? <span>/ month</span> : null}
      {p.price === 0 ? <em>Free forever, supported by ads</em> : null}
    </div>
  );
}

export function PlansView() {
  const { plans, region } = usePlans();
  const [billing, setBilling] = useState<Billing>('month');
  const [auto, setAuto] = useState(false);
  const start = useStart();
  const { buy, busy, signedIn, hydrated } = useBuy();
  const hasYearly = plans.some((p) => typeof p.yearly === 'number');
  const resumed = useRef(false);

  // back from signing in: carry on with what they chose
  useEffect(() => {
    if (!hydrated || !signedIn || resumed.current) return;
    const i = intentFromSearch(window.location.search);
    if (i?.kind === 'plan') {
      resumed.current = true;
      window.history.replaceState(null, '', '/pricing');
      void buy(i, i.id);
    }
  }, [hydrated, signedIn, buy]);

  const choose = (p: Plan) => {
    if (p.price === 0 || p.cta?.action === 'start') return start('/app');
    void buy({ kind: 'plan', id: p.id, billing, auto }, p.id);
  };
  const label = (p: Plan) => {
    if (p.price === 0) return 'Start free';
    const yr = billing === 'year' && typeof p.yearly === 'number';
    const total = yr ? p.yearly : p.price;
    return typeof total === 'number'
      ? `Buy ${p.name} · ${API.currency}${money(total)}${yr ? ' / year' : ' / month'}`
      : `Buy ${p.name}`;
  };

  return (
    <div className="plans-wrap">
      <ol className="pp-guide" aria-label="Which plan fits you">
        {plans.map((p) => (
          <li key={p.id}>
            <b>{p.name}</b>
            <span>{BEST_FOR[p.id] ?? p.tagline}</span>
          </li>
        ))}
      </ol>
      <div className="pp-controls">
        {hasYearly ? (
          <Segmented
            className="mono"
            value={billing}
            onChange={setBilling}
            options={[
              { value: 'month', label: 'Monthly' },
              {
                value: 'year',
                label: plans.find((p) => p.yearlySavePct)
                  ? `Yearly · save ${plans.find((p) => p.yearlySavePct)?.yearlySavePct}%`
                  : 'Yearly',
              },
            ]}
          />
        ) : null}
        {region.country ? (
          <p className="pp-region" aria-label="Where these prices apply">
            <span className="navtag">{region.country}</span>{' '}
            {`Prices for ${region.name || region.country}, in ${region.currency === 'INR' ? 'rupees' : 'US dollars'}. Pay by ${region.currency === 'INR' ? 'UPI, card or netbanking with Razorpay' : 'PayPal or card'}. ${VIA[region.via] ?? ''}${region.link ? ` Your link: ${region.link}.` : ''} No sign-in needed.`}
          </p>
        ) : null}
        <label className="check pp-auto">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>Renew automatically. Cancel any time in Settings.</span>
        </label>
      </div>
      <div className="plans">
        {plans.map((p) => (
          <article key={p.id} className={clsx('plan', p.featured && 'feat')}>
            {p.badge ? <span className="plan-badge">{p.badge}</span> : null}
            <div className="plan-h">
              <span className="plan-ic">
                <Icon name={p.icon || 'grid'} size={18} />
              </span>
              <div>
                <h3>{p.name}</h3>
                <p className="plan-tag">{p.tagline || ''}</p>
              </div>
            </div>
            <PlanPrice p={p} billing={billing} />
            <p className="plan-for">
              <Icon name="target" size={13} /> {BEST_FOR[p.id]}
            </p>
            <button
              className={clsx('btn lg plan-buy', (p.featured || p.price !== 0) && 'solid')}
              type="button"
              disabled={busy === p.id}
              onClick={() => choose(p)}
            >
              {busy === p.id ? <Spinner size={15} /> : null} {label(p)} <Icon name="chev-r" size={13} />
            </button>
            {p.price !== 0 ? (
              <span className="plan-secure">
                <Icon name="lock" size={12} /> Secure payment: UPI, cards, netbanking
              </span>
            ) : null}
            <div className="plan-rule" />
            <p className="plan-inh">{p.inherits || 'Includes'}</p>
            <ul>
              {(p.items || []).map((t) => (
                <li key={t}>
                  <Icon name="check" size={14} />
                  {t}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
