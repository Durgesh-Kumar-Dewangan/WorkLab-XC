'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminDesk } from './AdminDesk';
import { BackdropLibrary } from './BackdropLibrary';
import { AiStatus } from './AiStatus';
import { AdminUsers } from './AdminUsers';
import { Icon } from '@/components/ui/Icon';
import { api, ApiFail, hasBackend } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { ago } from '@/lib/util';

interface Overview {
  users: { total: number; last7d: number };
  runs: { last7d: number; done: number; failed: number };
  feedback: { last30d: number; averageRating: number | null };
  revenue30d: { orders: number; amountPaise: number; currency: string; usdCents?: number };
  openTickets: number;
}
interface Fb {
  id: string;
  kind: string;
  from: string;
  rating: number;
  comment: string;
  tags: string[];
  created: number;
}
interface Tk {
  id: string;
  email: string | null;
  contact: string | null;
  message: string;
  created: number;
}

/** Operator view: health of the business and what people are saying. Only admin accounts can load it. */
export function AdminPage() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [fb, setFb] = useState<Fb[]>([]);
  const [tk, setTk] = useState<Tk[]>([]);
  const [low, setLow] = useState(false);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, f, t] = await Promise.all([
        api<Overview>('/admin/overview'),
        api<{ feedback: Fb[] }>(`/admin/feedback?limit=50${low ? '&maxRating=2' : ''}`),
        api<{ tickets: Tk[] }>('/admin/tickets'),
      ]);
      setOv(o);
      setFb(f.feedback);
      setTk(t.tickets);
    } catch (e) {
      if ((e as ApiFail).status === 403) setDenied(true);
      else toast((e as ApiFail).message, 'err');
    }
  }, [low]);
  useEffect(() => {
    if (hasBackend()) void load();
  }, [load]);

  if (!hasBackend() || denied)
    return (
      <div className="page">
        <div className="ph">
          <h1>Admin</h1>
        </div>
        <div className="callout warn">
          <Icon name="lock" size={18} />
          <span>
            This page is for WorkLab XC administrators. Add your email to ADMIN_EMAILS on the server.
          </span>
        </div>
      </div>
    );

  const stat = (label: string, value: string, sub?: string) => (
    <div className="stat" key={label}>
      <div className="label">{label}</div>
      <div className="h2">{value}</div>
      {sub ? <div className="small">{sub}</div> : null}
    </div>
  );

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Operations</div>
          <h1 style={{ marginTop: 8 }}>Admin</h1>
        </div>
        <div className="acts">
          <button className="btn sm" type="button" onClick={() => void load()}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>
      </div>
      {ov ? (
        <div
          className="g3"
          style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}
        >
          {stat('People', String(ov.users.total), `${ov.users.last7d} joined this week`)}
          {stat('Runs this week', String(ov.runs.last7d), `${ov.runs.done} done · ${ov.runs.failed} failed`)}
          {stat(
            'Rating (30 days)',
            ov.feedback.averageRating === null ? '–' : `${ov.feedback.averageRating} / 5`,
            `${ov.feedback.last30d} responses`,
          )}
          {stat(
            'Revenue (30 days)',
            `₹${Math.round(ov.revenue30d.amountPaise / 100).toLocaleString('en-IN')}${ov.revenue30d.usdCents ? ` + $${(ov.revenue30d.usdCents / 100).toFixed(2)}` : ''}`,
            `${ov.revenue30d.orders} orders`,
          )}
          {stat('Open tickets', String(ov.openTickets))}
        </div>
      ) : null}

      <AdminDesk />

      <AiStatus />

      <BackdropLibrary />

      <AdminUsers />

      <div className="g21">
        <section className="card" aria-label="Feedback">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Feedback</h3>
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Low ratings
              only
            </label>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {fb.map((f) => (
              <li key={f.id}>
                <div className="small">
                  <b>{f.rating}/5</b> · {f.from} · {f.kind} · {ago(f.created)}
                  {f.tags.length ? ` · ${f.tags.join(', ')}` : ''}
                </div>
                {f.comment ? <p className="body">{f.comment}</p> : null}
              </li>
            ))}
            {!fb.length ? <li className="small">No feedback yet.</li> : null}
          </ul>
        </section>
        <section className="card" aria-label="Support tickets">
          <h3>Open tickets</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {tk.map((t) => (
              <li key={t.id}>
                <div className="small">
                  {t.id} · {t.email ?? t.contact ?? 'visitor'} · {ago(t.created)}
                </div>
                <p className="body">{t.message}</p>
                <button
                  className="btn xs"
                  type="button"
                  onClick={() =>
                    api(`/admin/tickets/${t.id}`, { body: {} })
                      .then(() => setTk((l) => l.filter((x) => x.id !== t.id)))
                      .catch((e: ApiFail) => toast(e.message, 'err'))
                  }
                >
                  Mark closed
                </button>
              </li>
            ))}
            {!tk.length ? <li className="small">All clear.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
