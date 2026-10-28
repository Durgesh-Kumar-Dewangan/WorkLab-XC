'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';

interface Coll {
  name: string;
  count: number;
  readOnly: boolean;
}
interface Browse {
  collection: string;
  total: number;
  capped: boolean;
  page: number;
  pageSize: number;
  readOnly: boolean;
  rows: { id: string; preview: string }[];
}
interface Doc {
  collection: string;
  id: string;
  readOnly: boolean;
  canDelete: boolean;
  doc: Record<string, unknown>;
}

/** The database, as a screen: pick a collection, find a record, read it, change it, add one, or delete one. Every change is written to the audit trail. */
export function AdminDatabase({ start }: { start?: { col: string; id: string } | null }) {
  const [cols, setCols] = useState<Coll[] | null>(null);
  const [blobs, setBlobs] = useState<{ count: number; megabytes: number } | null>(null);
  const [col, setCol] = useState(start?.col ?? 'users');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<Browse | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [text, setText] = useState('');
  const [fresh, setFresh] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCols = useCallback(() => {
    api<{ collections: Coll[]; blobs: { count: number; megabytes: number } }>('/admin/db/collections')
      .then((r) => {
        setCols(r.collections);
        setBlobs(r.blobs);
      })
      .catch(() => undefined);
  }, []);
  useEffect(loadCols, [loadCols]);

  const loadList = useCallback(() => {
    const qs = new URLSearchParams({ col, q, page: String(page) });
    api<Browse>(`/admin/db/browse?${qs}`)
      .then(setList)
      .catch((e) => toast((e as ApiFail).message || 'Could not load.', 'err'));
  }, [col, q, page]);
  useEffect(() => {
    const t = setTimeout(loadList, 250);
    return () => clearTimeout(t);
  }, [loadList]);

  const open = useCallback((c: string, id: string) => {
    api<Doc>(`/admin/db/doc?${new URLSearchParams({ col: c, id })}`)
      .then((d) => {
        setDoc(d);
        setText(JSON.stringify(d.doc, null, 2));
        setFresh(null);
      })
      .catch((e) => toast((e as ApiFail).message || 'Could not load.', 'err'));
  }, []);
  useEffect(() => {
    if (start?.id) open(start.col, start.id);
  }, [start, open]);

  const parse = (t: string) => {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* shown below */
    }
    toast('That is not a JSON object. Check the commas and quotes.', 'err');
    return null;
  };
  const save = async (mode: 'merge' | 'replace') => {
    if (!doc) return;
    const data = parse(text);
    if (!data) return;
    if (
      mode === 'replace' &&
      !window.confirm('Replace the whole record with this? Fields you remove will be gone.')
    )
      return;
    setBusy(true);
    try {
      const r = await api<Doc>('/admin/db/doc', {
        method: 'PUT',
        body: { col: doc.collection, id: doc.id, data, mode },
      });
      setDoc(r);
      setText(JSON.stringify(r.doc, null, 2));
      toast('Saved.', 'ok');
      loadList();
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!doc) return;
    const typed = window.prompt(`Delete ${doc.collection}/${doc.id}?\n\nType the record's id to confirm:`);
    if (typed === null) return;
    setBusy(true);
    try {
      await api('/admin/db/doc', {
        method: 'DELETE',
        body: { col: doc.collection, id: doc.id, confirm: typed },
      });
      toast('Deleted.', 'ok');
      setDoc(null);
      loadList();
      loadCols();
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    if (!fresh) return;
    const data = parse(fresh.text);
    if (!data) return;
    setBusy(true);
    try {
      const r = await api<Doc>('/admin/db/doc', { body: { col, id: fresh.id.trim() || undefined, data } });
      setDoc(r);
      setText(JSON.stringify(r.doc, null, 2));
      setFresh(null);
      toast('Created.', 'ok');
      loadList();
      loadCols();
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    } finally {
      setBusy(false);
    }
  };
  const current = cols?.find((c) => c.name === col);

  return (
    <div className="ad-db">
      <aside className="card ad-colls" aria-label="Collections">
        <h3 className="h3">Collections</h3>
        {cols ? (
          <ul>
            {cols.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  className={clsx(c.name === col && 'on')}
                  onClick={() => (setCol(c.name), setPage(1), setQ(''), setDoc(null), setFresh(null))}
                >
                  <span>
                    {c.readOnly ? <Icon name="lock" size={11} /> : null} {c.name}
                  </span>
                  <small>{c.count.toLocaleString()}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Spinner size={16} />
        )}
        {blobs ? (
          <p className="small">{`Files: ${blobs.count.toLocaleString()} (${blobs.megabytes} MB), not editable here.`}</p>
        ) : null}
      </aside>

      <section className="card ad-docs" aria-label="Records">
        <div className="ad-tools">
          <h3 className="h3" style={{ margin: 0 }}>
            {col}
            {current?.readOnly ? <span className="navtag"> read-only</span> : null}
          </h3>
          <input
            className="input"
            type="search"
            placeholder="Search inside records"
            aria-label="Search records"
            value={q}
            onChange={(e) => (setPage(1), setQ(e.target.value))}
          />
          {!current?.readOnly ? (
            <button
              className="btn xs solid"
              type="button"
              onClick={() => (setFresh({ id: '', text: '{\n  \n}' }), setDoc(null))}
            >
              New record
            </button>
          ) : null}
        </div>
        {list ? (
          <>
            <ul className="ad-rows">
              {list.rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={clsx(doc?.id === r.id && 'on')}
                    onClick={() => open(col, r.id)}
                  >
                    <b className="mono">{r.id || '(no id)'}</b>
                    <small>{r.preview}</small>
                  </button>
                </li>
              ))}
              {!list.rows.length ? <li className="small">No records.</li> : null}
            </ul>
            <div className="ad-pager">
              <span className="small">{`${list.total.toLocaleString()} record${list.total === 1 ? '' : 's'}${list.capped ? ' (showing the newest 5,000)' : ''}`}</span>
              <button
                className="btn xs"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn xs"
                type="button"
                disabled={page * list.pageSize >= list.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <Spinner size={16} />
        )}
      </section>

      <section className="card ad-editor" aria-label="Record">
        {fresh ? (
          <>
            <h3 className="h3">{`New record in ${col}`}</h3>
            <label className="field">
              <span className="label">Id (leave empty for a new one)</span>
              <input
                className="input mono"
                value={fresh.id}
                onChange={(e) => setFresh({ ...fresh, id: e.target.value })}
              />
            </label>
            <textarea
              className="input mono ad-json"
              rows={14}
              value={fresh.text}
              onChange={(e) => setFresh({ ...fresh, text: e.target.value })}
              aria-label="Record as JSON"
              spellCheck={false}
            />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn solid xs" type="button" disabled={busy} onClick={() => void create()}>
                Create
              </button>
              <button className="btn xs" type="button" onClick={() => setFresh(null)}>
                Cancel
              </button>
            </div>
          </>
        ) : doc ? (
          <>
            <h3 className="h3 mono">{`${doc.collection} / ${doc.id}`}</h3>
            {doc.readOnly ? (
              <p className="small">
                This collection is read-only. Records here are a log and cannot be edited.
              </p>
            ) : (
              <p className="small">
                Fields marked [hidden] are secrets. They are kept as they are and cannot be changed here.
              </p>
            )}
            <textarea
              className="input mono ad-json"
              rows={20}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="Record as JSON"
              spellCheck={false}
              readOnly={doc.readOnly}
            />
            {!doc.readOnly ? (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn solid xs"
                  type="button"
                  disabled={busy}
                  onClick={() => void save('merge')}
                  title="Change only the fields you edited"
                >
                  Save changes
                </button>
                {doc.collection !== 'users' ? (
                  <button
                    className="btn xs"
                    type="button"
                    disabled={busy}
                    onClick={() => void save('replace')}
                    title="Make the record exactly what is shown"
                  >
                    Replace whole record
                  </button>
                ) : null}
                {doc.canDelete ? (
                  <button
                    className="btn xs danger"
                    type="button"
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="small">
            Pick a record to read or edit it, or add a new one. To change the database from your own code
            instead, use <code>backend/scripts/db_admin.py</code>.
          </p>
        )}
      </section>
    </div>
  );
}
