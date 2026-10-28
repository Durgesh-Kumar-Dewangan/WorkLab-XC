'use client';

import { useEffect, useState } from 'react';
import { api, ApiFail } from '@/lib/api/client';
import { startBuying } from '@/lib/buy';
import { toast } from '@/lib/ui/toast';

interface Addons {
  catalogue: { sku: string; priceInr: number | null }[];
  currency?: { symbol: string };
  mine: { sku: string; validUntil: number | null }[];
}

/** The pay-per-month way to hide ads without moving to a paid plan. Shown to free accounts; paid accounts have no ads anyway. */
export function AdFreeRow({ onPlan }: { onPlan: boolean }) {
  const [a, setA] = useState<Addons | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Addons>('/addons')
      .then(setA)
      .catch(() => setA(null));
  }, []);
  if (onPlan) return <p className="small">Your plan shows no ads.</p>;
  const mine = a?.mine.find((m) => m.sku === 'noads');
  const price = a?.catalogue.find((c) => c.sku === 'noads')?.priceInr;
  if (mine)
    return (
      <p className="small">
        Ad-free is on{mine.validUntil ? ` until ${new Date(mine.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
      </p>
    );
  if (!price) return null;
  return (
    <button
      className="btn solid"
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await startBuying({ kind: 'addon', sku: 'noads' });
        } catch (e) {
          toast((e as ApiFail).message || 'Could not start the payment.', 'err');
          setBusy(false);
        }
      }}
    >
      {`Remove ads · ${a?.currency?.symbol ?? '₹'}${price} a month`}
    </button>
  );
}
