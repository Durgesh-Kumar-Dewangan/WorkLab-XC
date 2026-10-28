'use client';

import { useState } from 'react';
import { api, ApiFail } from '@/lib/api/client';
import { useServerMe } from '@/hooks/useServerMe';
import { toast } from '@/lib/ui/toast';

/** For an account with no username yet (it signed up with Google, or before usernames existed): asks for one, once, until it has one. */
export function UsernameBanner() {
  const { me, reload } = useServerMe();
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!me || me.user.username) return null;
  const save = async () => {
    const n = v.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(n)) return setErr('Use 3 to 24 letters, numbers or underscores.');
    setBusy(true);
    setErr('');
    try {
      await api('/profile', { method: 'PUT', body: { handle: n } });
      toast('Your username is set.', 'ok');
      reload();
    } catch (e) {
      setErr((e as ApiFail).message || 'That did not work.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ub" role="region" aria-label="Choose a username">
      <b>Choose your username</b>
      <span className="small">
        It is unique to you, shown on the leaderboard, and you can sign in with it.
      </span>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          value={v}
          maxLength={24}
          placeholder="asha_verma"
          aria-label="Username"
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <button
          className="btn solid xs"
          type="button"
          disabled={busy || v.trim().length < 3}
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
      {err ? (
        <span className="small bad" role="alert">
          {err}
        </span>
      ) : null}
    </div>
  );
}
