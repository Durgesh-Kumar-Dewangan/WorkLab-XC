import { api, ApiFail } from '@/lib/api/client';

export type Billing = 'month' | 'year';

/** What a visitor was about to buy when they were sent to sign in. It is carried in the address, so it survives the sign-in. */
export type Intent = { kind: 'plan'; id: string; billing: Billing; auto: boolean } | { kind: 'addon'; sku: string };

export const intentToPath = (i: Intent) =>
  i.kind === 'plan' ? `/pricing?buy=${i.id}:${i.billing}${i.auto ? ':auto' : ''}` : `/pricing?addon=${i.sku}`;

export function intentFromSearch(search: string): Intent | null {
  const q = new URLSearchParams(search);
  const buy = q.get('buy');
  if (buy) {
    const [id, billing, auto] = buy.split(':');
    if (/^[a-z]{3,12}$/.test(id) && (billing === 'month' || billing === 'year')) return { kind: 'plan', id, billing, auto: auto === 'auto' };
  }
  const sku = q.get('addon');
  return sku && /^[a-z_]{3,20}$/.test(sku) ? { kind: 'addon', sku } : null;
}

/** Starts the hosted payment page for a plan or add-on and sends the browser there. Throws an Error whose message can be shown as is. */
export async function startBuying(i: Intent): Promise<void> {
  try {
    const r =
      i.kind === 'plan'
        ? await api<{ url?: string }>('/checkout', { body: { plan: i.id, billing: i.billing, ...(i.auto ? { autoRenew: true } : {}) } })
        : await api<{ url?: string }>('/addons', { body: { sku: i.sku } });
    if (!r.url) throw new Error('The payment page did not open. Please try again.');
    window.location.href = r.url;
  } catch (e) {
    if (e instanceof ApiFail) {
      if (e.code === 'email_unverified') throw new Error('Confirm your email address first (we sent you a link), then you can buy.');
      throw new Error(e.message);
    }
    throw e;
  }
}
