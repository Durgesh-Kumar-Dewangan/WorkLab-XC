'use client';

import { useEffect, useRef } from 'react';
import { Icon, Spinner } from '@/components/ui/Icon';
import { intentFromSearch } from '@/lib/buy';
import { PageShell } from '@/components/site/PageShell';
import { PlansView, useBuy } from '@/components/site/landing/Plans';
import { usePlans } from '@/hooks/usePlans';
import { API } from '@/lib/config';
import { money } from '@/lib/plans';

const QA: [string, string][] = [
  [
    'Do I have to pay to start?',
    'No. Free gives you unlimited learning sessions for one subject at a time, supported by ads (including video ads). Beta adds the 3D classroom, removes the ads, and unlocks unlimited subjects, games, quizzes and practice exams. Beta Plus is Beta and the Study pack together at a lower price.',
  ],
  [
    'Will my courses carry over if I upgrade?',
    'Yes. Courses are saved to your account, so they follow you to any device. Upgrading to Beta changes your limits and unlocks the classroom, not your courses.',
  ],
  [
    'Can I try the 3D classroom before paying?',
    'Yes. The sample classroom on the “See how it works” page needs no account. Your own courses use the 3D classroom on the Beta plan; on Free you study the same lesson in the lesson view.',
  ],
];

const Cell = ({ v }: { v: boolean | string | undefined | null }) =>
  v === true ? (
    <span className="yes" aria-label="Included">
      <Icon name="check" size={15} />
    </span>
  ) : v === false || v === undefined || v === null ? (
    <span className="no" aria-label="Not included">
      –
    </span>
  ) : (
    <span className="txt">{String(v)}</span>
  );

export function PricingPage() {
  const { plans, compare, addons } = usePlans();
  const { buy, busy, signedIn, hydrated } = useBuy();
  const resumed = useRef(false);
  // back from signing in: carry on with the add-on they chose
  useEffect(() => {
    if (!hydrated || !signedIn || resumed.current) return;
    const i = intentFromSearch(window.location.search);
    if (i?.kind === 'addon') {
      resumed.current = true;
      window.history.replaceState(null, '', '/pricing');
      void buy(i, i.sku);
    }
  }, [hydrated, signedIn, buy]);
  return (
    <PageShell
      label="Pricing"
      title="Start free. Upgrade when you need more."
      lead="Free is supported by ads. Beta adds the 3D classroom and removes them. Beta Plus adds the tutor and unlimited notes for less than buying them apart."
    >
      <PlansView />
      <ul className="pp-trust" aria-label="Why people trust us">
        <li>
          <Icon name="lock" size={16} /> Secure payment by Razorpay: UPI, cards and netbanking
        </li>
        <li>
          <Icon name="refresh" size={16} /> Your courses stay with you if you ever go back to Free
        </li>
        <li>
          <Icon name="file-text" size={16} /> GST invoice emailed after every payment
        </li>
      </ul>
      {addons.length ? (
        <>
          <h2 className="h2" id="addons" style={{ margin: '64px 0 6px' }}>
            Add what you need
          </h2>
          <p className="body" style={{ marginBottom: 18 }}>
            Optional extras for any plan. Free and Beta both include 2 tutor questions and 2 unit notes every
            month, so try them first.
          </p>
          <div className="pp-addons">
            {addons.map((a) => (
              <article key={a.sku} className={`pp-addon${a.savePct ? ' deal' : ''}`}>
                {a.savePct ? <span className="pp-ribbon">{`Save ${a.savePct}%`}</span> : null}
                <h3>{a.name}</h3>
                <p>{a.description}</p>
                <div className="pp-addon-p">
                  <b className="num">{`${API.currency}${money(a.priceInr)}`}</b>
                  <span>{a.sku === 'unit_notes' ? '/ unit' : '/ month'}</span>
                  {a.listPriceInr ? <s>{`${API.currency}${money(a.listPriceInr)}`}</s> : null}
                </div>
                <span className={a.saveInr ? 'pp-saves' : 'pp-note'}>
                  {a.saveInr
                    ? `You save ${API.currency}${money(a.saveInr)} a month`
                    : a.sku === 'unit_notes'
                      ? 'One-time, no subscription'
                      : 'Valid for 30 days'}
                </span>
                <button
                  className={`btn sm${a.savePct ? ' solid' : ''}`}
                  type="button"
                  disabled={busy === a.sku}
                  onClick={() => void buy({ kind: 'addon', sku: a.sku }, a.sku)}
                >
                  {busy === a.sku ? <Spinner size={13} /> : null} Buy · {API.currency}
                  {money(a.priceInr)}
                </button>
              </article>
            ))}
          </div>
        </>
      ) : null}
      <h2 className="h2" style={{ margin: '72px 0 18px' }}>
        Compare plans
      </h2>
      <div className="cmp-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th>Feature</th>
              {plans.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compare.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {plans.map((p) => (
                  <td key={p.id} aria-label={p.name}>
                    <Cell v={r.values?.[p.id]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="h2" style={{ margin: '72px 0 18px' }}>
        Questions
      </h2>
      <div className="faq-list pp-faq">
        {QA.map(([q, a]) => (
          <div className="qa" key={q}>
            <h3>{q}</h3>
            <p className="ans">{a}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
