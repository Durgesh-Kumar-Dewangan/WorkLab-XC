'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useServerMe } from '@/hooks/useServerMe';
import { api } from '@/lib/api/client';
import { apiUrl } from '@/lib/config';
import { UsageCard } from '@/components/app/UsageCard';
import { Icon } from '@/components/ui/Icon';
import { Segmented, Switch } from '@/components/ui/controls';
import { clearAssets } from '@/lib/assets/store';
import { setAdChoice, useAdChoice } from '@/lib/consent';
import { getApp, useApp } from '@/lib/store';
import type { Quality, Settings, ThemePref } from '@/lib/store/types';
import { confirmBox, openModal } from '@/lib/ui/modal';
import { copyText, toast } from '@/lib/ui/toast';
import { speechAvailable } from '@/lib/util';
import { AccountSection } from './AccountSection';
import { SettingsShell } from '@/components/app/SettingsShell';
import { PathStylePicker } from '@/components/app/PathStylePicker';
import { AdFreeRow } from '@/components/app/AdFreeRow';
import { AiKeySettings } from '@/components/app/AiKeySettings';
import { DepthPicker } from '@/components/app/DepthPicker';
import { HallPicker } from '@/components/app/LookPreviews';
import { CustomLookControls, ThemePicker } from '@/components/app/ThemePicker';

function Row({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="setrow">
      <div className="tx">
        <b>{title}</b>
        <span>{desc}</span>
      </div>
      {children}
    </div>
  );
}
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="card" aria-label={title}>
    <h2>{title}</h2>
    <div className="setgrp">{children}</div>
  </section>
);

function showData() {
  const data = Object.fromEntries(
    Object.entries(getApp()).filter(([k, v]) => k !== 'session' && typeof v !== 'function'),
  );
  const txt = JSON.stringify(data, null, 2);
  const m = openModal({
    title: 'Your data',
    wide: true,
    body: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="body">
          What this browser has cached for your account, as JSON. To download everything held on the server,
          use Download my data above.
        </p>
        <textarea
          className="textarea"
          rows={12}
          readOnly
          aria-label="Exported data"
          style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
          defaultValue={txt}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
    ),
    actions: [
      { label: 'Close' },
      {
        label: 'Copy to clipboard',
        kind: 'solid',
        closes: false,
        onClick: () => {
          void copyText(txt);
          return false;
        },
      },
    ],
  });
  return m;
}

interface Purchase {
  id: string;
  paymentId: string | null;
  kind: string;
  item: string;
  billing?: string;
  amountPaise: number;
  currency?: string;
  country?: string;
  gateway?: string;
  renewal?: boolean;
  activatedAt: number;
  activeUntil: number | null;
  status: string;
}
const ITEM: Record<string, string> = {
  learner: 'Beta plan',
  classroom: 'Classroom plan',
  unit_notes: 'Unit notes',
  monthly_notes: 'Unlimited notes',
  chatbot: 'AI tutor chat',
  pack: 'Study pack',
};

interface Sub {
  id: string;
  plan: string;
  billing: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  renewsOrEndsAt: number | null;
  amountPaise: number;
  currency: string;
  gateway: string;
  country: string;
}

/** The auto-renewing plan: when it renews, what it costs, where it was priced for, and a way to stop it. */
function SubscriptionCard() {
  const [sub, setSub] = useState<Sub | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const load = () =>
    void api<{ subscription: Sub | null }>('/subscription')
      .then((r) => setSub(r.subscription))
      .catch(() => setSub(null));
  useEffect(load, []);
  if (!sub) return null;
  const live = ['created', 'authenticated', 'active', 'pending'].includes(sub.status);
  const money =
    sub.currency === 'USD'
      ? '$' + (sub.amountPaise / 100).toFixed(2)
      : '₹' + Math.round(sub.amountPaise / 100);
  const when = sub.renewsOrEndsAt
    ? new Date(sub.renewsOrEndsAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const stop = async () => {
    if (!window.confirm('Stop renewing? You keep your plan until the end of the period you have paid for.'))
      return;
    setBusy(true);
    try {
      await api('/subscription/cancel', { body: {} });
      toast('Auto-renew is off. Your plan stays until the end of the paid period.', 'ok');
      load();
    } catch (e) {
      toast((e as Error).message || 'That did not work.', 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Auto-renew">
      <Row
        title={`${sub.billing === 'year' ? 'Yearly' : 'Monthly'} plan, ${money} ${sub.billing === 'year' ? 'a year' : 'a month'}`}
        desc={
          sub.cancelAtPeriodEnd || !live
            ? `Will not renew${when ? `. Access until ${when}` : ''}.`
            : `Renews automatically${when ? ` on ${when}` : ''} through ${sub.gateway === 'paypal' ? 'PayPal' : 'Razorpay'}. A receipt is emailed and kept under Purchases after every payment.`
        }
      >
        {sub.country ? <span className="navtag">{sub.country}</span> : null}
        {live && !sub.cancelAtPeriodEnd ? (
          <button className="btn xs" type="button" disabled={busy} onClick={() => void stop()}>
            Stop renewing
          </button>
        ) : (
          <a className="btn xs solid" href="/pricing">
            Renew automatically again
          </a>
        )}
      </Row>
    </Section>
  );
}

interface AccessRow {
  at: number;
  what: string;
  why: string;
}

/** The learner's own side of support: the reference to read out when asking for help, and every time support looked at the account. */
function SupportAccess() {
  const [ref, setRef] = useState('');
  const [log, setLog] = useState<AccessRow[] | null>(null);
  useEffect(() => {
    api<{ ref: string }>('/me/support-ref')
      .then((r) => setRef(r.ref))
      .catch(() => undefined);
    api<{ log: AccessRow[] }>('/me/access-log')
      .then((r) => setLog(r.log))
      .catch(() => setLog([]));
  }, []);
  return (
    <Section title="Support and privacy">
      <Row
        title="Your support reference"
        desc="Read this out when you ask for help. It is the only thing support needs to find your account. It is not your name or email."
      >
        <code className="mono">{ref || '...'}</code>
        <button
          className="btn xs"
          type="button"
          disabled={!ref}
          onClick={() => void navigator.clipboard.writeText(ref).then(() => toast('Copied.', 'ok'))}
        >
          Copy
        </button>
      </Row>
      <Row
        title="Who looked at my account"
        desc="Support can only look at how your account is doing (plan, limits, errors), never your lessons, chats, notes or uploads, and only after writing down why. Each time is listed here."
      >
        <span className="navtag">{log ? `${log.length} entr${log.length === 1 ? 'y' : 'ies'}` : '...'}</span>
      </Row>
      {log?.length ? (
        <ul className="dv-list" aria-label="Access log">
          {log.slice(0, 20).map((a, i) => (
            <li key={i} className="small">
              <b>{a.what}</b>
              {` · ${new Date(a.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
              {a.why ? <span className="dim">{` · reason: ${a.why}`}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/** Every payment, with its payment id and what it switched on, so a learner can always show what they bought. */
function Purchases() {
  const [rows, setRows] = useState<Purchase[] | null>(null);
  useEffect(() => {
    void api<{ purchases: Purchase[] }>('/purchases')
      .then((r) => setRows(r.purchases))
      .catch(() => setRows([]));
  }, []);
  if (!rows?.length) return null;
  const d = (ms: number) =>
    new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <Section title="Purchases">
      {rows.map((p) => (
        <Row
          key={p.id}
          title={`${ITEM[p.item] ?? p.item}${p.billing ? ` (${p.billing === 'year' ? 'yearly' : 'monthly'})` : ''} · ${p.currency === 'USD' ? '$' + (p.amountPaise / 100).toFixed(2) : '₹' + Math.round(p.amountPaise / 100)}`}
          desc={`Paid ${d(p.activatedAt)} · active${p.activeUntil ? ` until ${d(p.activeUntil)}` : ''} · payment id ${p.paymentId ?? 'pending'}`}
        >
          {p.country ? <span className="navtag">{p.country}</span> : null}
          {p.renewal ? <span className="navtag">Renewal</span> : null}
          <a
            className="btn xs"
            href={apiUrl(`/receipts/${encodeURIComponent(p.id)}`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Receipt
          </a>
          <span className="navtag">{p.status === 'active' ? 'Activated' : p.status}</span>
        </Row>
      ))}
    </Section>
  );
}

export function SettingsPage() {
  const adChoice = useAdChoice();
  const { me, reload } = useServerMe();
  const router = useRouter();
  const S = useApp((s) => s.settings);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const upd = useApp((s) => s.updateSettings);
  const resetProgress = useApp((s) => s.resetProgress);
  const resetAll = useApp((s) => s.resetAll);
  const voiceOk = typeof window !== 'undefined' && speechAvailable();
  const set = (fn: (s: Settings) => void) => upd(fn);

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Settings</h1>
          <p className="sub">
            Display preferences are saved on this device. Your account and courses are on the server.
          </p>
        </div>
      </div>

      <SettingsShell>
        <AiKeySettings />
        <Section title="Appearance">
          <Row
            title="Theme"
            desc="Pick a look. The named ones are inspired by those products' styles, not copies. They apply everywhere, including the classroom's page around the 3D scene."
          >
            <ThemePicker />
          </Row>
          <Row
            title="Style buttons and elements too"
            desc="On: buttons, cards, inputs and menus take the shape and feel of the theme (pill buttons, chunky green ones, frosted glass). Off: they keep the standard look and only the theme's colours, background and type apply."
          >
            <Switch
              checked={S.themedElements !== false}
              onChange={(v) =>
                set((s) => {
                  s.themedElements = v;
                })
              }
              label="Style buttons and elements to match the theme"
            />
          </Row>
          <Row
            title="Learning path style"
            desc="How your levels look on the Learn page: six looks inspired by kinds of games, from stepping stones to a mountain climb."
          >
            <PathStylePicker />
          </Row>
          <Row
            title="Make it yours"
            desc="Your own accent colour, corners, letters and spacing, on top of any theme."
          >
            <CustomLookControls />
          </Row>
          <Row title="Text size" desc="Scales text across the app.">
            <Segmented<Settings['textSize']>
              ariaLabel="Text size"
              value={S.textSize}
              onChange={(v) =>
                set((s) => {
                  s.textSize = v;
                })
              }
              options={[
                { value: 'small', label: 'Small' },
                { value: 'default', label: 'Default' },
                { value: 'large', label: 'Large' },
              ]}
            />
          </Row>
          <Row
            title="Halftone imagery"
            desc="The dotted pictures. Turn off for flat images and lower power use."
          >
            <Switch
              label="Halftone imagery"
              checked={S.halftone}
              onChange={(v) =>
                set((s) => {
                  s.halftone = v;
                })
              }
            />
          </Row>
        </Section>

        <Section title="Lessons">
          <Row
            title="How deep lessons go"
            desc="Every topic is written on its own, at this depth. Quick is a short overview, Standard the usual lesson, Deep adds worked examples and the reasoning. A topic saved at another depth is written again when you open it."
          >
            <DepthPicker />
          </Row>
          <Row
            title="Learning session look"
            desc="Duolingo-style opens with a practice round: one card at a time, hearts, points that double for each right answer in a row. Wondering-style opens with calm explainer cards and real photos. Both are always one tap apart (Learn and Play), and both take their colours from your theme."
          >
            <Segmented<Settings['sessionStyle']>
              ariaLabel="Learning session look"
              value={S.sessionStyle ?? 'duolingo'}
              onChange={(v) =>
                set((s) => {
                  s.sessionStyle = v;
                })
              }
              options={[
                { value: 'duolingo', label: 'Duolingo-style' },
                { value: 'wondering', label: 'Wondering-style' },
                { value: 'classic', label: 'Classic' },
              ]}
            />
          </Row>
          <Row
            title="Real-world photos on slides"
            desc="Slides that name a real example show a freely licensed photograph beside the text, with its credit. Use the refresh button in the classroom to see another."
          >
            <Switch
              checked={S.slidePhotos !== false}
              onChange={(v) =>
                set((s) => {
                  s.slidePhotos = v;
                })
              }
              label="Real-world photos on slides"
            />
          </Row>
        </Section>

        <Section title="Motion">
          <Row
            title="Reduce motion"
            desc="Stops animated backgrounds, auto-playing visuals and camera tweens. “System” follows your device."
          >
            <Segmented<Settings['motion']>
              ariaLabel="Reduce motion"
              value={S.motion}
              onChange={(v) =>
                set((s) => {
                  s.motion = v;
                })
              }
              options={[
                { value: 'system', label: 'System' },
                { value: 'off', label: 'Reduce' },
              ]}
            />
          </Row>
        </Section>

        <Section title="Classroom">
          <Row title="Captions" desc="Show the narration as text in lessons and the classroom.">
            <Switch
              label="Captions"
              checked={S.captions}
              onChange={(v) =>
                set((s) => {
                  s.captions = v;
                })
              }
            />
          </Row>
          <Row
            title="Spoken narration"
            desc={
              voiceOk
                ? 'Uses your browser’s built-in voice. Quality depends on your device.'
                : 'Your browser has no speech voices available, so this is unavailable.'
            }
          >
            <Switch
              label="Spoken narration"
              checked={S.voice && voiceOk}
              disabled={!voiceOk}
              onChange={(v) =>
                set((s) => {
                  s.voice = v && voiceOk;
                })
              }
            />
          </Row>
          <Row title="3D quality" desc="Lower settings use fewer shadows and a lower pixel ratio.">
            <Segmented<Quality>
              ariaLabel="3D quality"
              value={S.quality}
              onChange={(v) =>
                set((s) => {
                  s.quality = v;
                })
              }
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </Row>
          <Row
            title="Classroom build"
            desc="The new halls are built from code in Babylon.js: an indoor hall and an open-air pavilion with a mountain backdrop. The two earlier builds stay available if the classroom looks wrong on your device."
          >
            <HallPicker />
          </Row>
          {S.engine === 'babylon' && (S.hall === 'pavilion' || S.hall === 'forest' || S.hall === 'collab') ? (
            <Row
              title="Scenery"
              desc="The mountains behind the stage. The queue changes the scenery by itself, in the order the library sets."
            >
              <Scenery
                value={S.backdrop ?? 'queue'}
                onChange={(v) =>
                  set((s) => {
                    s.backdrop = v;
                  })
                }
              />
            </Row>
          ) : null}
          <Row
            title="Classroom interface"
            desc="Classic puts the controls over the scene. Studio is a design-tool layout: slides and layers on the left, camera, room and style controls on the right (screens wider than 1000 px)."
          >
            <Segmented<Settings['classroomUi']>
              ariaLabel="Classroom interface"
              value={S.classroomUi ?? 'classic'}
              onChange={(v) =>
                set((s) => {
                  s.classroomUi = v;
                })
              }
              options={[
                { value: 'classic', label: 'Classic' },
                { value: 'studio', label: 'Studio' },
              ]}
            />
          </Row>
          <Row title="Default playback speed" desc="Lesson timeline speed.">
            <Segmented<number>
              ariaLabel="Playback speed"
              value={S.speed}
              onChange={(v) =>
                set((s) => {
                  s.speed = v;
                })
              }
              options={[
                { value: 0.75, label: '0.75×' },
                { value: 1, label: '1×' },
                { value: 1.25, label: '1.25×' },
                { value: 1.5, label: '1.5×' },
              ]}
            />
          </Row>
        </Section>

        <Section title="Notifications">
          {(
            [
              ['revision', 'Revision reminders', 'When a topic’s estimate drops low.'],
              ['progress', 'Progress notes', 'When a topic becomes a strong one.'],
              ['system', 'System messages', 'Welcome notes and course ready notices.'],
              ['tips', 'Tips', 'Occasional hints about features.'],
            ] as const
          ).map(([k, t, d]) => (
            <Row key={k} title={t} desc={d}>
              <Switch
                label={t}
                checked={S.notif[k]}
                onChange={(v) =>
                  set((s) => {
                    s.notif[k] = v;
                  })
                }
              />
            </Row>
          ))}
        </Section>

        <UsageCard />
        <SubscriptionCard />
        <Purchases />
        <SupportAccess />
        <AccountSection Section={Section} Row={Row} />

        <Section title="Ads and privacy">
          <Row
            title="Remove ads"
            desc="Free accounts see small ads, never over the lesson. Pay month by month to hide them without changing plan. The Beta plans have none."
          >
            <AdFreeRow onPlan={me ? me.user.plan !== 'prototype' : false} />
          </Row>
          <Row
            title="Personalised ads"
            desc="Free accounts see ads. Allow personalised ads, or keep them basic. Beta accounts see none."
          >
            <Switch
              checked={adChoice === 'personalised'}
              onChange={(v) => setAdChoice(v ? 'personalised' : 'basic')}
              label="Personalised ads"
            />
          </Row>
        </Section>

        <Section title="Emails">
          <Row
            title="Product emails"
            desc="News about new features and offers on plans. Receipts, security and plan-ending notices are always sent. One email at most every few days."
          >
            <Switch
              label="Product emails"
              checked={me?.mailPrefs?.marketing !== false}
              disabled={!me}
              onChange={(v) => void api('/me/mail-prefs', { body: { marketing: v } }).then(() => reload())}
            />
          </Row>
        </Section>

        <Section title="Your data">
          <Row title="Cached data" desc="See what this browser has cached as JSON.">
            <button className="btn" type="button" onClick={showData}>
              <Icon name="copy" size={15} />
              Show data
            </button>
          </Row>
          <Row
            title="Reset progress"
            desc="Clears answers, study time, activity and notifications. Keeps your courses."
          >
            <button
              className="btn danger"
              type="button"
              onClick={async () => {
                if (
                  await confirmBox({
                    title: 'Reset all progress?',
                    body: 'Answers, estimates, study time, activity and notifications will be cleared. Courses stay.',
                    confirmLabel: 'Reset progress',
                    danger: true,
                  })
                ) {
                  resetProgress();
                  toast('Progress reset', 'ok');
                }
              }}
            >
              Reset progress
            </button>
          </Row>
          <Row
            title="Clear this device"
            desc="Removes the cached courses, preferences and model files in this browser and signs you out. Your account is not deleted."
          >
            <button
              className="btn danger"
              type="button"
              onClick={async () => {
                if (
                  await confirmBox({
                    title: 'Clear this device?',
                    body: 'The cached courses, settings and model files in this browser are removed and you are signed out. Your account and its courses stay on the server.',
                    confirmLabel: 'Clear this device',
                    danger: true,
                  })
                ) {
                  await clearAssets();
                  resetAll();
                  toast('This device was cleared', 'ok');
                  router.push('/');
                }
              }}
            >
              Clear this device
            </button>
          </Row>
        </Section>
      </SettingsShell>
    </div>
  );
}

function Scenery({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [items, setItems] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    api<{ items: { id: string; title: string }[] }>('/backdrops')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  return (
    <select className="select" aria-label="Scenery" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="queue">Queue (changes automatically)</option>
      {items.map((b) => (
        <option key={b.id} value={b.id}>
          {b.title}
        </option>
      ))}
    </select>
  );
}
