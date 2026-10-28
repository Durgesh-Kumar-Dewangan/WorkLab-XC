'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { ago } from '@/lib/util';

interface Row {
  id: string;
  code: string;
  plan: string;
  status: string;
  topic: string;
  updated: number;
  waiting: boolean;
  last: string;
}
interface Sess {
  id: string;
  code: string;
  topic: string;
  note: string;
  wanted: number;
  at: number;
  status: string;
  plan: string;
}
interface Desk {
  chats: Row[];
  sessions: Sess[];
  stats: { open: number; waiting: number; avgFirstReplyMin: number | null; sessionsRequested: number; sessionsConfirmed: number };
}
interface Camp {
  id: string;
  subject: string;
  segment: string;
  created: number;
  sent: number;
  opened: number;
  clicked: number;
}
interface CampStats {
  campaigns: Camp[];
  lifecycle: { campaign: string; sent: number; opened: number; clicked: number }[];
  unsubscribed: number;
}
const HEROES = ['update', 'upgrade', 'renewal', 'expired', 'welcome', 'support', 'session', 'receipt', 'security'];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const fmt = (ms: number) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** The owner's support desk (chats and session requests, by code only) and the announcement composer with its results. */
export function AdminDesk() {
  const [desk, setDesk] = useState<Desk | null>(null);
  const [camps, setCamps] = useState<CampStats | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const [msgs, setMsgs] = useState<{ id: string; role: string; text: string; created: number }[]>([]);
  const [reply, setReply] = useState('');
  const [f, setF] = useState({ subject: '', headline: '', body: '', ctaLabel: '', ctaUrl: '', hero: 'update', segment: 'all' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([api<Desk>('/admin/support'), api<CampStats>('/admin/campaigns')]);
      setDesk(d);
      setCamps(c);
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const openChat = async (r: Row) => {
    setOpen(r);
    const m = await api<{ messages: typeof msgs }>(`/admin/support/chat/${r.id}`).catch(() => ({ messages: [] }));
    setMsgs(m.messages);
  };
  const send = async () => {
    if (!open || !reply.trim()) return;
    try {
      await api('/admin/support/reply', { body: { code: open.code, text: reply } });
      setReply('');
      await openChat(open);
      await load();
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    }
  };
  const decide = async (s: Sess, action: 'confirm' | 'decline' | 'done') => {
    try {
      await api('/admin/support/session', { body: { code: s.code, action, at: action === 'confirm' ? s.wanted : undefined } });
      await load();
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    }
  };
  const campaign = async (test: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ queued: number; skippedRecently: number }>('/admin/campaigns', {
        body: { ...f, ctaLabel: f.ctaLabel || undefined, ctaUrl: f.ctaUrl || undefined, test },
      });
      toast(test ? 'Test sent to you.' : `Queued for ${r.queued} people${r.skippedRecently ? ` (${r.skippedRecently} skipped: emailed in the last 3 days)` : ''}.`, 'ok');
      await load();
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card" aria-label="Support desk">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="h3">Support desk</h2>
          {desk ? (
            <span className="small">
              {desk.stats.open} open · {desk.stats.waiting} waiting for you · first reply {desk.stats.avgFirstReplyMin === null ? '–' : `${desk.stats.avgFirstReplyMin} min on average`} ·{' '}
              {desk.stats.sessionsRequested} session requests
            </span>
          ) : null}
        </div>
        <p className="small">Learners are shown only by code and plan. You can also answer on WhatsApp by sending “CODE your reply”, or “S-CODE confirm 2026-10-20 16:00”.</p>
        <div className="sc-grid">
          <ul className="sc-past">
            {desk?.chats.map((r) => (
              <li key={r.id}>
                <button className={`btn xs${open?.id === r.id ? ' solid' : ''}`} type="button" onClick={() => void openChat(r)}>
                  {r.code} · {r.plan} {r.waiting ? '· waiting' : ''}
                </button>
                <span className="small"> {ago(r.updated)} · {r.last}</span>
              </li>
            ))}
            {desk && !desk.chats.length ? <li className="small">No chats yet.</li> : null}
          </ul>
          <div>
            {open ? (
              <>
                <div className="sc-log" style={{ maxHeight: 240 }}>
                  {msgs.map((m) => (
                    <div key={m.id} className={`sc-msg ${m.role === 'team' ? 'user' : 'team'}`}>
                      <span>{m.text}</span>
                      <em>{m.role === 'team' ? 'You' : 'Learner'} · {ago(m.created)}</em>
                    </div>
                  ))}
                </div>
                <textarea className="textarea" rows={2} value={reply} maxLength={1000} aria-label="Reply" onChange={(e) => setReply(e.target.value)} />
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn solid sm" type="button" onClick={() => void send()}>
                    <Icon name="send" size={14} /> Reply
                  </button>
                  <button className="btn sm" type="button" onClick={() => api('/admin/support/close', { body: { code: open.code } }).then(() => load())}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <p className="small">Pick a chat to read and answer it.</p>
            )}
          </div>
        </div>
        {desk?.sessions.filter((s) => s.status === 'requested' || s.status === 'confirmed').length ? (
          <>
            <h3 className="h3" style={{ marginTop: 12 }}>
              Session requests
            </h3>
            <ul className="sc-past">
              {desk.sessions
                .filter((s) => s.status === 'requested' || s.status === 'confirmed')
                .map((s) => (
                  <li key={s.id}>
                    <b>{s.code}</b> · {s.plan} · {s.topic} · {s.status === 'confirmed' ? `at ${fmt(s.at)}` : `wants ${fmt(s.wanted)}`}
                    {s.note ? ` · ${s.note}` : ''}{' '}
                    {s.status === 'requested' ? (
                      <>
                        <button className="btn xs" type="button" onClick={() => void decide(s, 'confirm')}>
                          Confirm that time
                        </button>{' '}
                        <button className="btn xs" type="button" onClick={() => void decide(s, 'decline')}>
                          Decline
                        </button>
                      </>
                    ) : (
                      <button className="btn xs" type="button" onClick={() => void decide(s, 'done')}>
                        Mark done
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="card" aria-label="Email learners">
        <h2 className="h3">Email learners about an update</h2>
        <p className="small">
          Sent from your updates address, with a header picture, a tracked button and a one-click unsubscribe. Only verified learners who have not unsubscribed, and never more than one product email every 3 days to the same person. Send a test to yourself first.
        </p>
        <div className="sc-form">
          <label className="field">
            <span className="label">Subject</span>
            <input className="input" value={f.subject} maxLength={150} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Headline inside the email</span>
            <input className="input" value={f.headline} maxLength={120} onChange={(e) => setF({ ...f, headline: e.target.value })} />
          </label>
          <label className="field">
            <span className="label">Message (blank line starts a new paragraph)</span>
            <textarea className="textarea" rows={5} value={f.body} maxLength={4000} onChange={(e) => setF({ ...f, body: e.target.value })} />
          </label>
          <div className="row wrap-r" style={{ gap: 10 }}>
            <label className="field">
              <span className="label">Button text</span>
              <input className="input" value={f.ctaLabel} maxLength={40} onChange={(e) => setF({ ...f, ctaLabel: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Button goes to (on your site)</span>
              <input className="input" value={f.ctaUrl} placeholder="/pricing" onChange={(e) => setF({ ...f, ctaUrl: e.target.value })} />
            </label>
            <label className="field">
              <span className="label">Header picture</span>
              <select className="select" value={f.hero} onChange={(e) => setF({ ...f, hero: e.target.value })}>
                {HEROES.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Send to</span>
              <select className="select" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })}>
                <option value="all">Everyone</option>
                <option value="free">Free learners</option>
                <option value="paid">Beta learners</option>
              </select>
            </label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" type="button" disabled={busy || !f.subject || !f.headline || !f.body} onClick={() => void campaign(true)}>
              {busy ? <Spinner size={14} /> : null} Send a test to me
            </button>
            <button className="btn solid" type="button" disabled={busy || !f.subject || !f.headline || !f.body} onClick={() => void campaign(false)}>
              Send to learners
            </button>
          </div>
        </div>
        {camps ? (
          <>
            <h3 className="h3" style={{ marginTop: 14 }}>
              Results
            </h3>
            <div className="tablewrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Sent</th>
                    <th>Opened</th>
                    <th>Clicked</th>
                  </tr>
                </thead>
                <tbody>
                  {[...camps.campaigns.map((c) => ({ k: c.id, n: `${c.subject} (${c.segment})`, ...c })), ...camps.lifecycle.map((l) => ({ k: l.campaign, n: l.campaign.replace('lifecycle:', 'Automatic: '), ...l }))].map((c) => (
                    <tr key={c.k}>
                      <td>{c.n}</td>
                      <td>{c.sent}</td>
                      <td>{`${c.opened} (${pct(c.opened, c.sent)})`}</td>
                      <td>{`${c.clicked} (${pct(c.clicked, c.sent)})`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small">{camps.unsubscribed} people have unsubscribed from product email. Opens are approximate: some mail apps block the tracking picture.</p>
          </>
        ) : null}
      </section>
    </>
  );
}
