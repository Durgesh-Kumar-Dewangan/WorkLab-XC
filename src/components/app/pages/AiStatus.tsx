'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';

interface Overview {
  order: string[];
  routes: { id: string; provider: string; model: string; cooling: boolean }[];
}
interface Result {
  route: string;
  ok: boolean;
  ms: number;
  reply?: string;
  error?: string;
}

/** The owner's view of the AI chain: what is set up, the order it is tried in, and a live check of every route. */
export function AiStatus() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [res, setRes] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Overview>('/admin/ai')
      .then(setOv)
      .catch((e) => toast((e as ApiFail).message, 'err'));
  }, []);

  const test = async () => {
    setBusy(true);
    try {
      setRes((await api<{ results: Result[] }>('/admin/ai/test', { body: {} })).results);
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-label="AI providers">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="h3">AI providers</h2>
        <button className="btn xs" type="button" disabled={busy || !ov?.routes.length} onClick={() => void test()}>
          {busy ? <Spinner /> : null} Test every route
        </button>
      </div>
      <p className="small">
        Tried in this order. If one fails or is rate limited, the next one answers, so a lesson never stalls on one service. Keys are never shown here.
      </p>
      {ov && !ov.routes.length ? (
        <p className="small">No AI provider is set up. Add a key to the server settings (for a free start: GROQ_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, or run Ollama), then reload.</p>
      ) : null}
      <ol className="sc-past">
        {ov?.routes.map((r) => {
          const t = res?.find((x) => x.route === r.id);
          return (
            <li key={r.id}>
              <b>{r.provider}</b> · {r.model}
              {r.cooling ? ' · resting for a minute' : ''}
              {t ? (t.ok ? ` · works (${t.ms} ms)` : ` · failed: ${t.error}`) : ''}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
