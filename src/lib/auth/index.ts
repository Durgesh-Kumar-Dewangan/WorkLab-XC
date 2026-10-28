import { API, apiUrl } from '../config';
import { getTurnstileToken, resetTurnstile, turnstileSiteKey } from './turnstile';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type AuthResult =
  | { ok: true; name: string; email: string }
  | { ok: false; field: 'email' | 'pw' | 'username'; msg: string; create?: boolean };

export function nameFromEmail(e: string): string {
  const l = (e.split('@')[0] || 'learner').replace(/[._-]+/g, ' ').trim();
  return (
    l
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Learner'
  );
}

export function passScore(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) && p.length >= 8) s++;
  return s;
}

class AuthError extends Error {
  code = '';
}

async function authApi(path: string, body: unknown): Promise<{ name?: string; email?: string }> {
  // with the security check switched on, a token from the Turnstile box goes with the request; it works once
  const t = getTurnstileToken();
  if (turnstileSiteKey() && !t)
    throw new Error('Please wait a moment for the security check to finish, then try again.');
  let r: Response;
  try {
    r = await fetch(apiUrl((API.auth || '') + path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(t ? { ...(body as object), turnstileToken: t } : body),
    });
  } catch {
    throw new Error('Could not reach WorkLab XC. Check your connection and try again.');
  }
  const j = (await r.json().catch(() => ({}))) as {
    message?: string;
    error?: string;
    name?: string;
    email?: string;
  };
  if (!r.ok) {
    resetTurnstile();
    const err = new AuthError(j.message || j.error || 'Something went wrong. Try again.');
    err.code = j.error || '';
    throw err;
  }
  return j;
}

/** Creates the account on the server, which also starts the session. */
export async function accountRegister(
  name: string,
  email: string,
  pw: string,
  consent = true,
  profile: Record<string, unknown> = {},
): Promise<AuthResult> {
  try {
    // a friend's share link (/register?ref=CODE) carries the code through to the new account
    const ref =
      typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('ref') || '';
    const j = await authApi('/auth/register', {
      name,
      email,
      password: pw,
      consent,
      ...profile,
      ...(ref ? { ref } : {}),
    });
    return { ok: true, name: j.name || name, email: j.email || email };
  } catch (e) {
    const code = (e as AuthError).code;
    return {
      ok: false,
      field: code === 'username_taken' || code === 'bad_username' ? 'username' : 'email',
      msg: (e as Error).message,
    };
  }
}

export async function accountLogin(email: string, pw: string): Promise<AuthResult> {
  try {
    const j = await authApi('/auth/login', { email, password: pw });
    return { ok: true, name: j.name || nameFromEmail(email), email: j.email || email };
  } catch (e) {
    return { ok: false, field: 'pw', msg: (e as Error).message };
  }
}
