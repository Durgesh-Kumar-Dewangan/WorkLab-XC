'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { FeedbackForm, type FeedbackDone } from '@/components/feedback/FeedbackForm';
import { api, hasBackend } from '@/lib/api/client';
import { ago } from '@/lib/util';

interface Mine {
  id: string;
  kind: 'session' | 'general';
  rating: number;
  comment: string;
  created: number;
}

/** Tell us what to fix or build. Goes to the team by email and to the admin dashboard. */
export function FeedbackPage() {
  const [mine, setMine] = useState<Mine[]>([]);
  const [wa, setWa] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const load = useCallback(() => {
    if (hasBackend())
      api<{ feedback: Mine[] }>('/feedback')
        .then((r) => setMine(r.feedback))
        .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  if (!hasBackend())
    return (
      <div className="page">
        <div className="ph">
          <div>
            <h1>Feedback</h1>
            <p className="sub">
              Feedback needs the WorkLab XC server. Until then, write to support@worklabxc.com.
            </p>
          </div>
        </div>
      </div>
    );

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Feedback</div>
          <h1 style={{ marginTop: 8 }}>Help us improve</h1>
          <p className="sub">A real person reads every message. Low ratings get a reply faster.</p>
        </div>
      </div>
      <div className="g21">
        <div className="card">
          <h3>How is WorkLab XC working for you?</h3>
          <FeedbackForm
            key={round}
            page="/app/feedback"
            onDone={(r: FeedbackDone) => {
              setWa(r.whatsapp ?? null);
              setRound((n) => n + 1);
              load();
            }}
          />
          {wa ? (
            <p className="small">
              Want a faster answer?{' '}
              <a href={wa} target="_blank" rel="noopener noreferrer">
                Continue on WhatsApp
              </a>
            </p>
          ) : null}
        </div>
        <div className="card">
          <h3>Your recent feedback</h3>
          {mine.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
              {mine.slice(0, 8).map((f) => (
                <li key={f.id}>
                  <div className="row" style={{ gap: 6 }}>
                    {Array.from({ length: f.rating }, (_, i) => (
                      <Icon key={i} name="star" size={13} />
                    ))}
                    <span className="small">
                      · {f.kind === 'session' ? 'after a lesson' : 'general'} · {ago(f.created)}
                    </span>
                  </div>
                  {f.comment ? <p className="small">{f.comment}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small">Nothing yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
