'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon, Spinner } from '@/components/ui/Icon';
import { Field } from '@/components/ui/controls';
import { AuthShell } from './AuthShell';
import { api, ApiFail } from '@/lib/api/client';
import { EMAIL_RE, passScore } from '@/lib/auth';
import { useApp } from '@/lib/store';

const Done = ({ children }: { children: React.ReactNode }) => (
  <div className="demo-note">
    <Icon name="check" size={18} />
    <span>{children}</span>
  </div>
);

/** Request a reset link by email. The answer is the same whether or not the address has an account. */
export function ForgotPasswordForm({ embedded = false }: { embedded?: boolean }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    if (!EMAIL_RE.test(email)) return setErr('Enter a valid email address.');
    setErr('');
    setBusy(true);
    try {
      await api('/auth/forgot-password', { body: { email } });
      setSent(true);
    } catch (x) {
      setErr((x as ApiFail).message);
    } finally {
      setBusy(false);
    }
  };
  const body = sent ? (
    <Done>
      If that address has an account, a reset link is on its way. It works for one hour. Check spam too.
    </Done>
  ) : (
    <form noValidate onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="body">
        Enter the email you registered with and we will send you a link to choose a new password.
      </p>
      <Field
        id="fp-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={err}
      />
      <button className="btn solid" type="submit" disabled={busy}>
        {busy ? (
          <>
            <Spinner size={14} /> Sending
          </>
        ) : (
          'Send reset link'
        )}
      </button>
    </form>
  );
  if (embedded) return body;
  return (
    <AuthShell mode="help">
      <h1 className="h1">Forgot your password?</h1>
      {body}
      <p className="small">
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [err, setErr] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setErr('Use at least 8 characters.');
    if (passScore(pw) < 2) return setErr('Add a capital letter or a number to make it harder to guess.');
    setErr('');
    setBusy(true);
    try {
      await api('/auth/reset-password', { body: { token, password: pw } });
      setDone(true);
    } catch (x) {
      setErr((x as ApiFail).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell mode="help">
      <h1 className="h1">Choose a new password</h1>
      {!token ? (
        <Done>This link is missing its code. Open the link from your email again, or request a new one.</Done>
      ) : done ? (
        <>
          <Done>Your password was changed and other devices were signed out.</Done>
          <Link className="btn solid" href="/login">
            Sign in
          </Link>
        </>
      ) : (
        <form noValidate onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field
            id="rp-pw"
            name="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            error={err}
            hint="At least 8 characters."
          />
          <button className="btn solid" type="submit" disabled={busy}>
            {busy ? <Spinner size={14} /> : 'Change password'}
          </button>
          <p className="small">
            Link expired? <Link href="/forgot-password">Get a new one</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

export function VerifyEmailView() {
  const token = useSearchParams().get('token') ?? '';
  const signedIn = useApp((s) => !!s.session);
  const [state, setState] = useState<'working' | 'ok' | 'bad'>('working');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!token) {
      setState('bad');
      setMsg('This link is missing its code.');
      return;
    }
    let live = true;
    api('/auth/verify-email', { body: { token } })
      .then(() => live && setState('ok'))
      .catch((e: ApiFail) => {
        if (!live) return;
        setState('bad');
        setMsg(e.message);
      });
    return () => {
      live = false;
    };
  }, [token]);
  return (
    <AuthShell mode="help">
      <h1 className="h1">Confirm your email</h1>
      {state === 'working' ? (
        <p className="body">
          <Spinner size={14} /> Checking your link…
        </p>
      ) : state === 'ok' ? (
        <>
          <Done>Your email is confirmed. Thank you.</Done>
          <Link className="btn solid" href={signedIn ? '/app' : '/login'}>
            {signedIn ? 'Open Studio' : 'Sign in'}
          </Link>
        </>
      ) : (
        <>
          <div className="callout warn" role="alert">
            <Icon name="alert" size={18} />
            <span>{msg || 'That link is invalid or has expired.'}</span>
          </div>
          <p className="small">Sign in and use “Send the link again” in Studio to get a fresh link.</p>
          <Link className="btn" href="/login">
            Sign in
          </Link>
        </>
      )}
    </AuthShell>
  );
}
