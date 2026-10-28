'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LimitNotice } from '@/components/app/LimitNotice';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { ago } from '@/lib/util';

interface Msg {
  id: string;
  role: 'user' | 'team';
  text: string;
  created: number;
}
interface Chat {
  id: string;
  code: string;
  status: 'open' | 'answered' | 'closed';
  topic: string;
  updated: number;
}
interface Sess {
  id: string;
  code: string;
  topic: string;
  note: string;
  wanted: number;
  at: number;
  status: 'requested' | 'confirmed' | 'declined' | 'done' | 'cancelled';
  teamNote?: string;
}
interface Data {
  chat: Chat | null;
  messages: Msg[];
  sessions: Sess[];
}

const TOPICS = ['A lesson or the classroom', 'Payment or plan', 'My account', 'Exams or notes', 'Something else'];
const STATUS: Record<Sess['status'], string> = {
  requested: 'Waiting for the team',
  confirmed: 'Confirmed',
  declined: 'Not possible',
  done: 'Done',
  cancelled: 'Cancelled',
};
const fmt = (ms: number) =>
  new Date(ms).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const localInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/**
 * Talk to the team from inside the account, or book a support session at a time that suits you. The team answers on
 * WhatsApp but only ever sees a short code, the plan and your words: no phone number, email or name goes across, and you
 * never see theirs.
 */
export function SupportPage() {
  const [data, setData] = useState<Data | null>(null);
  const [text, setText] = useState('');
  const [topic, setTopic] = useState(TOPICS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiFail | null>(null);
  const [when, setWhen] = useState(() => localInput(Date.now() + 24 * 3600_000));
  const [stopic, setStopic] = useState(TOPICS[0]);
  const [note, setNote] = useState('');
  const [booking, setBooking] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>('/support/chat'));
    } catch (e) {
      setErr(e as ApiFail);
    }
  }, []);
  useEffect(() => {
    void load();
    // the team's answers appear on their own: check every few seconds while the page is open
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 8000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      setData(await api<Data>('/support/chat', { body: { text: t, topic: data?.chat && data.chat.status !== 'closed' ? undefined : topic } }));
      setText('');
    } catch (e) {
      setErr(e as ApiFail);
    } finally {
      setBusy(false);
    }
  };
  const close = async () => {
    try {
      setData(await api<Data>('/support/chat/close', { body: {} }));
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    }
  };
  const book = async () => {
    const ms = new Date(when).getTime();
    if (!ms || Number.isNaN(ms)) return toast('Pick a date and time first.', 'err');
    setBooking(true);
    setErr(null);
    try {
      await api('/support/session', { body: { topic: stopic, wanted: ms, note } });
      setNote('');
      toast('Request sent. We will confirm a time by email.', 'ok');
      await load();
    } catch (e) {
      setErr(e as ApiFail);
    } finally {
      setBooking(false);
    }
  };
  const cancel = async (id: string) => {
    try {
      await api(`/support/session/${id}/cancel`, { body: {} });
      await load();
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    }
  };

  const chat = data?.chat && data.chat.status !== 'closed' ? data.chat : null;
  const open = data?.sessions.find((s) => s.status === 'requested' || s.status === 'confirmed');

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Help</div>
          <h1 style={{ marginTop: 8 }}>Support</h1>
          <p className="sub">Write to our team, or book a time to talk. Your phone number and email are never shared in this chat, and neither are ours.</p>
        </div>
      </div>
      {err ? <LimitNotice error={err} /> : null}
      <div className="sc-grid">
        <section className="card sc-chat" aria-label="Chat with the team">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="h3">Chat with the team</h2>
            {chat ? (
              <span className={`sc-chip ${chat.status}`}>
                {chat.status === 'answered' ? 'Answered' : 'Waiting for a reply'} · {chat.code}
              </span>
            ) : null}
          </div>
          <div className="sc-log" ref={log} role="log" aria-live="polite" aria-label="Messages">
            {!data ? (
              <p className="small">
                <Spinner size={14} /> Loading
              </p>
            ) : data.messages.length ? (
              data.messages.map((m) => (
                <div key={m.id} className={`sc-msg ${m.role}`}>
                  <span>{m.text}</span>
                  <em>
                    {m.role === 'team' ? 'WorkLab XC team' : 'You'} · {ago(m.created)}
                  </em>
                </div>
              ))
            ) : (
              <p className="small">No messages yet. Tell us what you need and we will answer here. Most questions get a reply within a few hours.</p>
            )}
          </div>
          {!chat ? (
            <label className="field">
              <span className="label">What is it about?</span>
              <select className="select" value={topic} onChange={(e) => setTopic(e.target.value)}>
                {TOPICS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          ) : null}
          <textarea
            className="textarea"
            rows={3}
            maxLength={1000}
            value={text}
            placeholder="Describe what happened, and what you expected"
            aria-label="Your message"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send();
            }}
          />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn solid" type="button" disabled={busy || !text.trim()} onClick={() => void send()}>
              {busy ? <Spinner size={14} /> : <Icon name="send" size={14} />} Send
            </button>
            {chat ? (
              <button className="btn" type="button" onClick={() => void close()}>
                It is sorted, close chat
              </button>
            ) : null}
          </div>
        </section>

        <section className="card" aria-label="Book a support session">
          <h2 className="h3">Book a support session</h2>
          <p className="small">Prefer to talk it through? Ask for a time. We confirm by email, and the session happens in this chat, so there is no phone number to share.</p>
          {open ? (
            <div className="sc-sess">
              <b>{open.status === 'confirmed' ? `Confirmed for ${fmt(open.at)} IST` : `Requested for around ${fmt(open.wanted)}`}</b>
              <span className="small">
                {STATUS[open.status]} · {open.code}
                {open.teamNote ? ` · ${open.teamNote}` : ''}
              </span>
              <button className="btn xs" type="button" onClick={() => void cancel(open.id)}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <label className="field">
                <span className="label">Topic</span>
                <select className="select" value={stopic} onChange={(e) => setStopic(e.target.value)}>
                  {TOPICS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">A time that suits you (your local time)</span>
                <input className="input" type="datetime-local" value={when} min={localInput(Date.now() + 3600_000)} onChange={(e) => setWhen(e.target.value)} />
              </label>
              <label className="field">
                <span className="label">Anything we should know (optional)</span>
                <textarea className="textarea" rows={2} maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button className="btn solid" type="button" disabled={booking} onClick={() => void book()}>
                {booking ? <Spinner size={14} /> : <Icon name="clock" size={14} />} Ask for this time
              </button>
            </>
          )}
          {data?.sessions.filter((s) => s !== open).length ? (
            <>
              <h3 className="h3" style={{ marginTop: 14 }}>
                Earlier requests
              </h3>
              <ul className="sc-past">
                {data.sessions
                  .filter((s) => s !== open)
                  .map((s) => (
                    <li key={s.id} className="small">
                      {fmt(s.at || s.wanted)} · {STATUS[s.status]}
                    </li>
                  ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
