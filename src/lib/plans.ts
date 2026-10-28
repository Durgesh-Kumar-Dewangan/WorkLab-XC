import { API, apiUrl, hasBackend } from './config';

export interface Plan {
  id: string;
  name: string;
  tagline?: string;
  status: 'live' | 'available' | 'planned';
  price: number | null;
  yearly: number | null;
  /** Percentage and rupees saved by paying yearly instead of month by month. */
  yearlySavePct?: number;
  yearlySaveInr?: number;
  /** For a combined plan: what its parts cost separately each month, and the saving. */
  listPrice?: number;
  savePct?: number;
  saveInr?: number;
  priceLabel?: string;
  badge?: string;
  featured?: boolean;
  inherits?: string;
  icon?: string;
  items: string[];
  cta: { label: string; action: 'start' | 'contact' | 'checkout'; topic?: string };
}
export interface AddonInfo {
  sku: string;
  name: string;
  description: string;
  priceInr: number;
  listPriceInr?: number;
  saveInr?: number;
  savePct?: number;
}
export interface CompareRow {
  label: string;
  values: Record<string, boolean | string>;
}

export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'prototype',
    name: 'Free',
    tagline: 'Learn one subject, with ads.',
    status: 'available',
    price: 0,
    yearly: null,
    priceLabel: 'Free',
    icon: 'flask',
    items: [
      'Unlimited learning sessions',
      'One subject at a time',
      'Text and Markdown syllabi',
      'AI-written lesson for every topic',
      'Ads while you learn, including video ads',
      'No games, quizzes or practice exams',
      'Each month: 1 classroom session, 2 tutor questions, 2 unit notes',
    ],
    cta: { label: 'Get started', action: 'start' },
  },
  {
    id: 'learner',
    name: 'Beta',
    tagline: 'Everything, including the 3D classroom.',
    status: 'planned',
    price: null,
    yearly: null,
    badge: 'Paid',
    icon: 'cube',
    inherits: 'Everything in Free, plus',
    items: [
      'Unlimited 3D classroom sessions',
      'No ads',
      'Unlimited subjects',
      'Games and quizzes',
      'Practice exams with a timed window and handwritten-sheet marking',
      'PDF and Word syllabi',
      'AI illustrations',
      '2 tutor questions and 2 unit notes every month',
    ],
    cta: { label: 'Notify me', action: 'contact', topic: 'beta' },
  },
  {
    id: 'plus',
    name: 'Beta Plus',
    tagline: 'Beta and the Study pack, at one lower price.',
    status: 'planned',
    price: null,
    yearly: null,
    featured: true,
    badge: 'Best value',
    icon: 'sparkles',
    inherits: 'Everything in Beta, plus',
    items: [
      'AI class chat: ask in any lesson or classroom',
      'Unlimited unit notes by marks',
      '4 support sessions a month',
    ],
    cta: { label: 'Notify me', action: 'contact', topic: 'plus' },
  },
];

export const DEFAULT_COMPARE: CompareRow[] = [
  { label: 'Learning sessions', values: { prototype: 'Unlimited', learner: 'Unlimited', plus: 'Unlimited' } },
  { label: 'Subjects (courses)', values: { prototype: '1', learner: 'Unlimited', plus: 'Unlimited' } },
  { label: 'Ads while you learn', values: { prototype: 'Yes, incl. video', learner: 'None', plus: 'None' } },
  {
    label: '3D classroom',
    values: { prototype: '1 session a month', learner: 'Unlimited', plus: 'Unlimited' },
  },
  { label: 'Games and quizzes', values: { prototype: false, learner: true, plus: true } },
  {
    label: 'Practice exams and handwritten marking',
    values: { prototype: false, learner: true, plus: true },
  },
  { label: 'PDF and Word syllabi', values: { prototype: false, learner: true, plus: true } },
  {
    label: 'AI class chat (tutor)',
    values: { prototype: '2 a month', learner: '2 a month', plus: 'Unlimited' },
  },
  {
    label: 'Unit notes by marks',
    values: { prototype: '2 a month', learner: '2 a month', plus: 'Unlimited' },
  },
];

/** 4.99 stays 4.99 and 99 stays 99. */
/** Where the prices were worked out for, as the server saw it. */
export const region = { country: '', name: '', currency: '', via: '', link: '' };

export const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Fetches plans from the configured backend; resolves null (keep the built-in plans) on any problem. */
export async function fetchPlans(): Promise<{
  plans: Plan[];
  compare?: CompareRow[];
  addons?: AddonInfo[];
} | null> {
  if (!hasBackend()) return null;
  try {
    // no sign-in needed: the server works out the country from the connection, and these hints cover a connection that does not say
    const conn = (navigator as unknown as { connection?: { type?: string; effectiveType?: string } })
      .connection;
    const qs = new URLSearchParams({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      lang: navigator.language || '',
      ct: conn?.type || '',
    });
    const r = await fetch(apiUrl(`${API.plans}?${qs}`), {
      headers: {
        accept: 'application/json',
        ...(conn?.effectiveType ? { 'x-wlxc-net': `ect=${conn.effectiveType}` } : {}),
      },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as
      Plan[] | { plans?: Plan[]; compare?: CompareRow[]; addons?: AddonInfo[]; symbol?: string };
    // prices follow where the visitor is, so the symbol comes from the server too
    if (!Array.isArray(j) && j?.symbol) {
      API.currency = j.symbol;
      const x = j as {
        country?: string;
        countryName?: string;
        currency?: string;
        detectedBy?: string;
        signal?: { type?: string; speed?: string };
      };
      const link = [x.signal?.type, x.signal?.speed ? x.signal.speed.toUpperCase() : '']
        .filter(Boolean)
        .join(' · ');
      Object.assign(region, {
        country: x.country ?? '',
        name: x.countryName ?? '',
        currency: x.currency ?? '',
        via: x.detectedBy ?? '',
        link,
      });
    }
    const plans = Array.isArray(j) ? j : j?.plans;
    if (!Array.isArray(plans) || !plans.length) return null;
    return {
      plans,
      compare: Array.isArray(j) ? undefined : j.compare,
      addons: Array.isArray(j) ? undefined : j.addons,
    };
  } catch {
    return null;
  }
}

/** Starts hosted checkout; resolves the redirect URL or throws. */
export async function startCheckout(plan: string, billing: 'month' | 'year'): Promise<string> {
  const r = await fetch(apiUrl(API.checkout), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan, billing }),
  });
  if (!r.ok) throw new Error(String(r.status));
  const j = (await r.json()) as { url?: string };
  if (!j.url) throw new Error('no url');
  return j.url;
}

export async function submitLead(payload: {
  name: string;
  email: string;
  role: string;
  message: string;
  at: number;
}): Promise<boolean> {
  try {
    const r = await fetch(apiUrl(API.leads), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.ok;
  } catch {
    return false;
  }
}
