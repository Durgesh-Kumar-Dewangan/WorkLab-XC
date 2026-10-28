'use client';

import { useEffect, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail, hasBackend } from '@/lib/api/client';
import { useServerMe } from '@/hooks/useServerMe';
import { confirmBox } from '@/lib/ui/modal';
import { toast } from '@/lib/ui/toast';

interface Provider {
  id: string;
  label: string;
  model: string;
  free: boolean;
  url: string;
  hint: string;
  images: boolean;
}
interface State {
  providers: Provider[];
  connected: boolean;
  status?: string;
  provider?: string;
  model?: string;
  last4?: string;
  added?: number;
  error?: string;
}

/**
 * "Use your own AI key". The learner connects their own account with an AI provider; every AI feature then runs on it, so none of
 * our limits apply. The key is checked once, kept encrypted on the server, and never shown again (only its last four characters).
 */
export function AiKeySettings() {
  const { reload } = useServerMe();
  const [s, setS] = useState<State | null>(null);
  const [provider, setProvider] = useState('gemini');
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!hasBackend()) return;
    api<State>('/me/ai-key')
      .then(setS)
      .catch(() => undefined);
  }, []);
  if (!hasBackend() || !s) return null;

  const p = s.providers.find((x) => x.id === provider) ?? s.providers[0];
  const current = s.providers.find((x) => x.id === s.provider);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const next = await api<State>('/me/ai-key', {
        method: 'PUT',
        body: { provider, key: key.trim(), model: model.trim() },
      });
      setS(next);
      setKey('');
      setModel('');
      setShow(false);
      toast('Your key works and is saved. Every AI feature now runs on it.', 'ok');
      void reload();
    } catch (x) {
      setErr((x as ApiFail).message || 'That key could not be checked.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !(await confirmBox({
        title: 'Remove your key?',
        body: 'Your key is deleted from our servers. Features go back to the limits of your plan.',
        confirmLabel: 'Remove it',
        danger: true,
      }))
    )
      return;
    setBusy(true);
    try {
      setS(await api<State>('/me/ai-key', { method: 'DELETE' }));
      toast('Your key was removed.', 'ok');
      void reload();
    } catch (x) {
      toast((x as ApiFail).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-label="Your own AI key">
      <h2>Your own AI key</h2>
      <p className="body">
        Connect your own account with an AI provider and every feature runs on it: lessons, games, practice
        exams, the AI tutor, notes and pictures, with <b>none of our daily or monthly limits</b>. You pay your
        provider directly, and several of them have a free tier.
      </p>

      {s.connected ? (
        <div className="callout ok" role="status">
          <Icon name="check" size={18} />
          <div>
            <b>
              Connected to {current?.label ?? s.provider} · key ending {s.last4}
            </b>
            <p className="small" style={{ margin: '4px 0 0' }}>
              Model {s.model}. Everything you generate now uses this key.
              {current && !current.images ? ' Pictures use our free image models.' : ''}
            </p>
          </div>
        </div>
      ) : s.status === 'rejected' ? (
        <div className="callout warn" role="alert">
          <Icon name="lock" size={18} />
          <div>
            <b>Your {current?.label ?? 'provider'} key was refused, so it was switched off.</b>
            <p className="small" style={{ margin: '4px 0 0' }}>
              {s.error || 'Add a new key below, or carry on with the normal limits.'}
            </p>
          </div>
        </div>
      ) : null}

      <form onSubmit={save} className="ak-form" autoComplete="off">
        <div className="ak-providers" role="radiogroup" aria-label="AI provider">
          {s.providers.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={provider === x.id}
              className={clsx('ak-prov', provider === x.id && 'on')}
              onClick={() => {
                setProvider(x.id);
                setErr('');
              }}
            >
              <b>{x.label}</b>
              <small>{x.free ? 'Has a free tier' : 'Paid account'}</small>
            </button>
          ))}
        </div>
        <p className="small">
          Get a {p.label} key from{' '}
          <a href={p.url} target="_blank" rel="noopener noreferrer">
            {new URL(p.url).host}
          </a>
          , then paste it here.
        </p>
        <label className="field">
          <span className="label">{p.label} API key</span>
          <div className="ak-row">
            <input
              className="input mono"
              type={show ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={p.hint || 'Paste your key'}
              autoComplete="off"
              spellCheck={false}
              maxLength={400}
              aria-invalid={!!err}
            />
            <button type="button" className="btn sm" onClick={() => setShow((v) => !v)} aria-pressed={show}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <label className="field">
          <span className="label">Model (optional)</span>
          <input
            className="input mono"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={p.model}
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
          />
          <span className="small">Leave blank to use {p.model}.</span>
        </label>
        {err ? (
          <p className="small bad" role="alert">
            {err}
          </p>
        ) : null}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn solid" type="submit" disabled={busy || key.trim().length < 12}>
            {busy ? <Spinner size={14} /> : <Icon name="check" size={14} />}
            {s.connected ? 'Check and replace key' : 'Check and save key'}
          </button>
          {s.connected || s.status === 'rejected' ? (
            <button className="btn" type="button" onClick={remove} disabled={busy}>
              Remove my key
            </button>
          ) : null}
        </div>
      </form>

      <ul className="small ak-notes">
        <li>
          We make one small test request to check the key, then keep it encrypted. It is never shown again,
          only its last four characters.
        </li>
        <li>
          It is used only for your own requests, never for anyone else, and staff cannot read it. Remove it
          any time and it is deleted.
        </li>
        <li>
          If your provider rejects the key later, we switch it off and tell you. You are billed by your
          provider, so set a spending limit with them.
        </li>
      </ul>
    </section>
  );
}
