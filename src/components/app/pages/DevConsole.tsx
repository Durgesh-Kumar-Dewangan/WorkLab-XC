'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';

interface Issue {
  id: string;
  route: string;
  status: number;
  code: string;
  source: string;
  message: string;
  state: string;
  count: number;
  learners: number;
  first: number;
  last: number;
  lastRid: string;
  notes: { at: number; state: string; note: string }[];
  samples: string[];
}
interface View {
  ref: string;
  case: { id: string; reason: string; until: number };
  account: {
    plan: string;
    planUntil: number | null;
    created: number;
    lastSeen: number | null;
    emailVerified: boolean;
    emailHint: string;
    country: string;
    role: string;
    sessions: number;
  };
  usageToday: Record<string, number>;
  entitlements: { sku: string; quantity: number | null; validUntil: number | null }[];
  block: { reason: string; until: number | null } | null;
  jobs: { id: string; status: string; topics: number; created: number; error: string }[];
  orders: {
    id: string;
    status: string;
    amountMinor: number;
    currency: string;
    gateway: string;
    country: string;
    created: number;
    activated: boolean;
  }[];
  issues: {
    id: string;
    route: string;
    status: number;
    code: string;
    message: string;
    state: string;
    last: number;
  }[];
  activity: { day: string; minutes?: number; [k: string]: unknown }[];
  actions: { at: number; action: string }[];
  hidden: string[];
}

const when = (ms?: number | null) =>
  ms
    ? new Date(ms).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'never';
const money = (m: number, c: string) =>
  c === 'USD' ? `$${(m / 100).toFixed(2)}` : `₹${Math.round(m / 100)}`;
const STATES = ['open', 'investigating', 'resolved', 'ignored'];

/** The developer console: faults grouped as they happen, and a case-based look at one learner's problem. It shows how an account is doing, never what the learner made or said. */
export function DevConsole() {
  const [tab, setTab] = useState<'issues' | 'case'>('issues');
  const [ref, setRef] = useState('');
  const [denied, setDenied] = useState(false);

  const toCase = (r: string) => {
    setRef(r);
    setTab('case');
  };
  return (
    <div className="page dv">
      <div className="ph">
        <div>
          <div className="label">Developer</div>
          <h1 style={{ marginTop: 8 }}>
            Find and fix <em>one problem at a time</em>
          </h1>
          <p className="sub">
            Learners are known only by a support reference. You see how an account is doing, never their name,
            lessons, chats, notes or uploads. Every look and every fix is written to an audit trail the
            learner can read.
          </p>
        </div>
      </div>
      {denied ? (
        <p className="card">This console is for developers. Ask an admin to add your email to DEV_EMAILS.</p>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {(['issues', 'case'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={clsx(tab === t && 'on')}
                type="button"
                onClick={() => setTab(t)}
              >
                {t === 'issues' ? 'Issues' : 'Learner case'}
              </button>
            ))}
          </div>
          {tab === 'issues' ? (
            <Issues onCase={toCase} onDenied={() => setDenied(true)} />
          ) : (
            <Case initialRef={ref} />
          )}
        </>
      )}
    </div>
  );
}

function Issues({ onCase, onDenied }: { onCase: (ref: string) => void; onDenied: () => void }) {
  const [rows, setRows] = useState<Issue[] | null>(null);
  const [state, setState] = useState('');
  const load = useCallback(() => {
    api<{ issues: Issue[] }>(`/dev/issues${state ? `?state=${state}` : ''}`)
      .then((r) => setRows(r.issues))
      .catch((e) => (e instanceof ApiFail && e.status === 403 ? onDenied() : setRows([])));
  }, [state, onDenied]);
  useEffect(load, [load]);
  const set = async (id: string, s: string) => {
    const note = s === 'resolved' ? window.prompt('What fixed it? (kept with the issue)') || '' : '';
    try {
      await api(`/dev/issues/${encodeURIComponent(id)}`, { body: { state: s, note } });
      load();
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    }
  };
  return (
    <section className="card" aria-label="Issues">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 className="h3">Faults, grouped</h2>
        <select
          className="input"
          aria-label="Filter by state"
          value={state}
          onChange={(e) => setState(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <p className="small">
        One record per fault, however many learners hit it. Messages are cleaned of emails, tokens and long
        numbers before they are kept.
      </p>
      {rows === null ? (
        <Spinner size={18} />
      ) : rows.length ? (
        <ul className="dv-list">
          {rows.map((i) => (
            <li key={i.id} className={clsx('dv-issue', i.state)}>
              <div className="dv-top">
                <b className="mono">{i.route}</b>
                <span className="navtag">{i.source === 'client' ? 'app' : i.status}</span>
                <span className="navtag">{i.code}</span>
              </div>
              <p className="small">{i.message || 'No message.'}</p>
              <p className="small dim">{`${i.count} time${i.count === 1 ? '' : 's'} · ${i.learners} learner${i.learners === 1 ? '' : 's'} · last ${when(i.last)}${i.lastRid ? ` · request ${i.lastRid.slice(0, 8)}` : ''}`}</p>
              {i.notes.length ? (
                <p className="small dim">{`Last note: ${i.notes[i.notes.length - 1].note || i.notes[i.notes.length - 1].state}`}</p>
              ) : null}
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <select
                  className="input"
                  aria-label="State"
                  value={i.state}
                  onChange={(e) => void set(i.id, e.target.value)}
                  style={{ width: 'auto' }}
                >
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                {i.samples.map((s) => (
                  <button
                    key={s}
                    className="btn xs"
                    type="button"
                    onClick={() => onCase(s)}
                    title="Open a case on one affected learner"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small">Nothing here. Faults appear as they happen.</p>
      )}
    </section>
  );
}

function Case({ initialRef }: { initialRef: string }) {
  const [ref, setRef] = useState(initialRef);
  const [reason, setReason] = useState('');
  const [cid, setCid] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [actions, setActions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback((id: string) => {
    api<View>(`/dev/cases/${encodeURIComponent(id)}`)
      .then((v) => {
        setView(v);
        setErr('');
      })
      .catch((e) => {
        setErr((e as ApiFail).message || 'Could not load.');
        setView(null);
        setCid('');
      });
  }, []);
  useEffect(() => {
    api<{ actions: Record<string, string> }>('/dev/actions')
      .then((r) => setActions(r.actions))
      .catch(() => undefined);
  }, []);

  const open = async () => {
    setBusy('open');
    setErr('');
    try {
      const r = await api<{ id: string }>('/dev/cases', { body: { ref: ref.trim(), reason } });
      setCid(r.id);
      load(r.id);
    } catch (e) {
      setErr((e as ApiFail).message || 'Could not open the case.');
    } finally {
      setBusy('');
    }
  };
  const act = async (action: string, target = '') => {
    const note = window.prompt(`${actions[action] ?? action}\n\nNote for the audit trail (optional):`);
    if (note === null) return;
    setBusy(action);
    try {
      const r = await api<{ result: string }>(`/dev/cases/${encodeURIComponent(cid)}/act`, {
        body: { action, note, target },
      });
      toast(`Done: ${r.result}`, 'ok');
      load(cid);
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    } finally {
      setBusy('');
    }
  };
  const close = async () => {
    await api(`/dev/cases/${encodeURIComponent(cid)}/close`, { body: {} }).catch(() => undefined);
    setCid('');
    setView(null);
    setReason('');
  };

  if (!cid || !view)
    return (
      <section className="card" aria-label="Open a case">
        <h2 className="h3">Open a case</h2>
        <p className="small">
          Ask the learner for the support reference shown in their Settings. Say why you need to look; it is
          shown to them. A case lasts 30 minutes.
        </p>
        <label className="field">
          <span className="label">Support reference</span>
          <input
            className="input mono"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="WLX-ABC123"
          />
        </label>
        <label className="field">
          <span className="label">Why (a ticket code or a sentence)</span>
          <textarea
            className="input"
            rows={2}
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ticket 4411: lessons will not load"
          />
        </label>
        {err ? (
          <p className="small" role="alert" style={{ color: 'var(--red, #e5484d)' }}>
            {err}
          </p>
        ) : null}
        <button
          className="btn solid"
          type="button"
          disabled={busy === 'open' || ref.trim().length < 6 || reason.trim().length < 10}
          onClick={() => void open()}
        >
          Open case
        </button>
      </section>
    );

  const quiet = Object.entries(view.usageToday).filter(([, n]) => n > 0);
  return (
    <div className="dv-case">
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 className="h3 mono">{view.ref}</h2>
            <p className="small">{`Case open until ${when(view.case.until)} · ${view.case.reason}`}</p>
          </div>
          <button className="btn xs" type="button" onClick={() => void close()}>
            <Icon name="x" size={13} /> Close case
          </button>
        </div>
        <dl className="dv-facts">
          <div>
            <dt>Plan</dt>
            <dd>{`${view.account.plan}${view.account.planUntil ? ` until ${when(view.account.planUntil)}` : ''}`}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{when(view.account.created)}</dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>{when(view.account.lastSeen)}</dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{view.account.country || 'unknown'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{`${view.account.emailHint} · ${view.account.emailVerified ? 'confirmed' : 'not confirmed'}`}</dd>
          </div>
          <div>
            <dt>Used today</dt>
            <dd>{quiet.length ? quiet.map(([k, n]) => `${k} ${n}`).join(' · ') : 'nothing'}</dd>
          </div>
        </dl>
        {view.block ? (
          <p
            className="small"
            role="status"
          >{`Blocked: ${view.block.reason}${view.block.until ? ` until ${when(view.block.until)}` : ''}`}</p>
        ) : null}
        <p className="small dim">{`Not shown, by design: ${view.hidden.join(', ')}.`}</p>
      </section>

      <section className="card">
        <h3 className="h3">Fix</h3>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(actions)
            .filter(([k]) => k !== 'recheck_payment')
            .map(([k, label]) => (
              <button
                key={k}
                className="btn xs"
                type="button"
                disabled={!!busy}
                title={label}
                onClick={() => void act(k)}
              >
                {busy === k ? <Spinner size={12} /> : null} {k.replace(/_/g, ' ')}
              </button>
            ))}
        </div>
        {view.actions.length ? (
          <p className="small dim">{`Done in this case: ${view.actions.map((a) => a.action.replace(/_/g, ' ')).join(', ')}`}</p>
        ) : null}
      </section>

      <section className="card">
        <h3 className="h3">Faults for this learner</h3>
        {view.issues.length ? (
          <ul className="dv-list">
            {view.issues.map((i) => (
              <li key={i.id} className="dv-issue">
                <b className="mono">{i.route}</b> <span className="navtag">{i.code}</span>{' '}
                <span className="navtag">{i.state}</span>
                <p className="small">{i.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small">No faults recorded.</p>
        )}
      </section>

      <section className="card">
        <h3 className="h3">Runs and payments</h3>
        <ul className="dv-list">
          {view.jobs.map((j) => (
            <li
              key={j.id}
              className="small"
            >{`Run ${j.id.slice(-6)} · ${j.status} · ${j.topics} topics · ${when(j.created)}${j.error ? ` · ${j.error}` : ''}`}</li>
          ))}
          {view.orders.map((o) => (
            <li key={o.id} className="small row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span>{`Order ${o.id.slice(-6)} · ${o.status} · ${money(o.amountMinor, o.currency)} · ${o.gateway} · ${o.country || '–'} · ${when(o.created)}`}</span>
              {o.status !== 'paid' ? (
                <button
                  className="btn xs"
                  type="button"
                  disabled={!!busy}
                  onClick={() => void act('recheck_payment', o.id)}
                >
                  Re-check payment
                </button>
              ) : null}
            </li>
          ))}
          {!view.jobs.length && !view.orders.length ? <li className="small">None.</li> : null}
        </ul>
      </section>

      <section className="card">
        <h3 className="h3">Entitlements</h3>
        <p className="small">
          {view.entitlements.length
            ? view.entitlements
                .map(
                  (e) =>
                    `${e.sku}${e.quantity ? ` ×${e.quantity}` : ''}${e.validUntil ? ` until ${when(e.validUntil)}` : ''}`,
                )
                .join(' · ')
            : 'None.'}
        </p>
      </section>
    </div>
  );
}
