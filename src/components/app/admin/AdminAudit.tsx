'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { when } from './shared';

interface Row {
  id: string;
  at: number;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
}

/** The trail: every admin, developer and system action that matters, newest first. It cannot be edited. */
export function AdminAudit() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    api<{ rows: Row[] }>(`/admin/audit?limit=300${filter ? `&action=${encodeURIComponent(filter)}` : ''}`)
      .then((r) => setRows(r.rows))
      .catch((e) => setErr((e as ApiFail).message || 'Could not load.'));
  }, [filter]);
  return (
    <section className="card" aria-label="Audit trail">
      <div className="ad-tools">
        <h2 className="h3" style={{ margin: 0 }}>
          Audit trail
        </h2>
        <select
          className="input"
          aria-label="Filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="">Everything</option>
          <option value="admin.db">Database changes</option>
          <option value="admin.user_view">Learner views</option>
          <option value="dev.">Developer console</option>
          <option value="block">Blocks</option>
        </select>
      </div>
      {err ? <p className="small bad">{err}</p> : null}
      {rows === null ? (
        <Spinner size={16} />
      ) : (
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>On</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.at)}</td>
                  <td>{r.actor}</td>
                  <td className="mono">{r.action}</td>
                  <td className="mono">{r.target}</td>
                  <td className="small">
                    {Object.keys(r.detail || {}).length ? JSON.stringify(r.detail) : ''}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5}>Nothing recorded.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
