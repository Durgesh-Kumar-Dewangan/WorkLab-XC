'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';

export interface Backdrop {
  id: string;
  title: string;
  kind: 'painted' | 'image' | 'video';
  src: string;
  order: number;
  seconds: number;
  active: boolean;
}

const PAINTED: Record<string, string> = { alpine: 'Alpine morning', sunset: 'Golden sunset', pines: 'Misty pines' };

/** The owner's backdrop library for the open-air classrooms: add scenery, set its order and how long it plays, switch it on or off. */
export function BackdropLibrary() {
  const [items, setItems] = useState<Backdrop[] | null>(null);
  const [f, setF] = useState({ title: '', kind: 'image' as Backdrop['kind'], src: '', seconds: 90 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: Backdrop[] }>('/admin/backdrops')).items);
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    }
  };
  const swap = (a: Backdrop, b: Backdrop | undefined) => {
    if (!b) return;
    void act(async () => {
      await api(`/admin/backdrops/${a.id}`, { method: 'PUT', body: { order: b.order } });
      await api(`/admin/backdrops/${b.id}`, { method: 'PUT', body: { order: a.order } });
    });
  };
  const add = async () => {
    setBusy(true);
    await act(async () => {
      await api('/admin/backdrops', { body: { title: f.title, kind: f.kind, src: f.src, seconds: f.seconds } });
      setF({ ...f, title: '', src: '' });
      toast('Added to the queue.', 'ok');
    });
    setBusy(false);
  };

  return (
    <section className="card" aria-label="Backdrop library">
      <h2 className="h3">Classroom backdrops</h2>
      <p className="small">
        The open-air classrooms show these scenes behind the stage, one after another, in this order. Painted scenes are always available. Add a picture or video by link (https) or a file you placed in public/backdrops.
      </p>
      <div className="tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Title</th>
              <th>Kind</th>
              <th>Seconds</th>
              <th>Playing</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items?.map((b, i) => (
              <tr key={b.id}>
                <td>
                  <button className="btn xs" type="button" aria-label={`Move ${b.title} up`} disabled={i === 0} onClick={() => swap(b, items[i - 1])}>
                    ↑
                  </button>{' '}
                  <button className="btn xs" type="button" aria-label={`Move ${b.title} down`} disabled={i === items.length - 1} onClick={() => swap(b, items[i + 1])}>
                    ↓
                  </button>
                </td>
                <td>{b.title}</td>
                <td>{b.kind}</td>
                <td>{b.seconds}</td>
                <td>
                  <input type="checkbox" checked={b.active} aria-label={`${b.title} is in the queue`} onChange={(e) => void act(() => api(`/admin/backdrops/${b.id}`, { method: 'PUT', body: { active: e.target.checked } }))} />
                </td>
                <td>
                  {b.kind === 'painted' && b.id.startsWith('preset-') ? null : (
                    <button className="btn xs" type="button" onClick={() => void act(() => api(`/admin/backdrops/${b.id}`, { method: 'DELETE' }))}>
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sc-form" style={{ marginTop: 14 }}>
        <div className="field">
          <label className="label">Title</label>
          <input className="input" value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </div>
        <div className="field">
          <label className="label">Kind</label>
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Backdrop['kind'], src: '' })}>
            <option value="image">Picture</option>
            <option value="video">Video</option>
            <option value="painted">Painted scene</option>
          </select>
        </div>
        <div className="field">
          <label className="label">{f.kind === 'painted' ? 'Scene' : 'Link or file'}</label>
          {f.kind === 'painted' ? (
            <select className="select" value={f.src} onChange={(e) => setF({ ...f, src: e.target.value })}>
              <option value="">Choose…</option>
              {Object.entries(PAINTED).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <input className="input" value={f.src} placeholder="https://… or /backdrops/lake.mp4" maxLength={500} onChange={(e) => setF({ ...f, src: e.target.value })} />
          )}
        </div>
        <div className="field">
          <label className="label">Seconds on screen</label>
          <input className="input" type="number" min={20} max={1800} value={f.seconds} onChange={(e) => setF({ ...f, seconds: Number(e.target.value) || 90 })} />
        </div>
        <button className="btn solid sm" type="button" disabled={busy || !f.title.trim() || !f.src.trim()} onClick={() => void add()}>
          Add to the queue
        </button>
      </div>
    </section>
  );
}
