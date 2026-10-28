'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/ui/Icon';
import { Field } from '@/components/ui/controls';
import { AuthShell } from './AuthShell';
import { GoogleAuth } from './GoogleAuth';
import { ForgotModal } from './ForgotModal';
import { TurnstileBox } from '@/components/auth/Turnstile';
import { accountLogin, EMAIL_RE } from '@/lib/auth';
import { useApp } from '@/lib/store';
import { openModal } from '@/lib/ui/modal';
import { toast } from '@/lib/ui/toast';

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/app');

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const signIn = useApp((s) => s.signIn);
  const [errs, setErrs] = useState<{ email?: string; pw?: string; form?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [caps, setCaps] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const email = String(f.get('email') ?? '').trim();
    const pw = String(f.get('password') ?? '');
    const next2: typeof errs = {};
    if (!email) next2.email = 'Enter your email address or username.';
    else if (email.includes('@') ? !EMAIL_RE.test(email) : !/^[a-z0-9_]{3,24}$/i.test(email))
      next2.email = 'Enter the email you signed up with, or your username.';
    if (!pw) next2.pw = 'Enter your password.';
    else if (pw.length < 8) next2.pw = 'Passwords have at least 8 characters.';
    setErrs(next2);
    if (next2.email || next2.pw) return;
    setBusy(true);
    const r = await accountLogin(email, pw);
    setBusy(false);
    if (!r.ok) {
      setErrs({ [r.field]: r.msg, form: !!r.create });
      return;
    }
    signIn({ name: r.name, email: r.email });
    toast(`Signed in as ${r.email}`, 'ok');
    router.push(next);
  };

  return (
    <AuthShell mode="login">
      <div>
        <h1 className="h1">Sign in</h1>
        <p className="body" style={{ marginTop: 8 }}>
          Welcome back. Your courses, sessions and progress are waiting.
        </p>
      </div>
      <form noValidate onSubmit={onSubmit}>
        <Field
          id="li-email"
          name="email"
          label="Email or username"
          type="text"
          autoComplete="username"
          placeholder="you@example.com or your username"
          error={errs.email}
        />
        <div>
          <Field
            id="li-pw"
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="At least 8 characters"
            error={errs.pw}
            onKeyUp={(e: KeyboardEvent) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
          />
          {caps ? (
            <div className="small bad" role="alert">
              Caps Lock is on.
            </div>
          ) : null}
        </div>
        <div className="auth-row">
          <label className="check">
            <input type="checkbox" id="li-rem" defaultChecked />
            Keep me signed in on this device
          </label>
          <button
            className="link-btn"
            type="button"
            onClick={() => openModal({ title: 'Reset your password', body: <ForgotModal /> })}
          >
            Forgot password?
          </button>
        </div>
        {errs.form ? (
          <div className="small bad" role="alert">
            <Link href="/register" style={{ textDecoration: 'underline' }}>
              Create an account with this email
            </Link>
          </div>
        ) : null}
        <TurnstileBox />
        <button
          className="btn solid lg"
          type="submit"
          id="li-submit"
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? (
            <>
              <Spinner size={15} /> Signing in
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
      <GoogleAuth mode="login" />
      <p className="small" style={{ textAlign: 'center' }}>
        New here?{' '}
        <Link href="/register" style={{ textDecoration: 'underline' }}>
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
