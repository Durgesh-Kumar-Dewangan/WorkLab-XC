'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/Icon';
import { Field } from '@/components/ui/controls';
import { api, ApiFail } from '@/lib/api/client';
import { CurriculumFields } from '@/components/app/CurriculumFields';
import { useApp } from '@/lib/store';
import { toast } from '@/lib/ui/toast';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

interface GsiApi {
  accounts: {
    id: {
      initialize: (o: {
        client_id: string;
        callback: (r: { credential?: string }) => void;
        ux_mode?: string;
        auto_select?: boolean;
      }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
}
declare global {
  interface Window {
    google?: GsiApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google sign-in could not load.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

const LEVELS: [string, string][] = [
  ['school', 'Secondary school'],
  ['college', 'College or university'],
  ['self', 'Self-study'],
  ['professional', 'Teaching others'],
];

interface Account {
  name?: string;
  email?: string;
  needsProfile?: boolean;
}

/**
 * "Continue with Google" for sign in and for creating an account. Google confirms who the person is; for someone new we still ask the
 * same few details as the email form (and the terms), because lessons are matched to them.
 */
export function GoogleAuth({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [credential, setCredential] = useState('');
  const [who, setWho] = useState<{ name: string; email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [cur, setCur] = useState({ country: '', category: '' });

  const finish = useCallback(
    (r: Account, created: boolean) => {
      const name = r.name ?? 'there';
      useApp.getState().signIn({ name, email: r.email ?? '' });
      toast(created ? `Account created. Welcome, ${name.split(' ')[0]}.` : `Signed in as ${r.email}`, 'ok');
      const n = new URLSearchParams(window.location.search).get('next');
      router.push(n && n.startsWith('/') && !n.startsWith('//') ? n : '/app');
    },
    [router],
  );

  const send = useCallback(
    async (cred: string, extra: Record<string, unknown> = {}) => {
      setBusy(true);
      setErr('');
      try {
        const r = await api<Account>('/auth/google', { body: { credential: cred, ...extra } });
        if (r.needsProfile) {
          setCredential(cred);
          setWho({ name: r.name ?? '', email: r.email ?? '' });
        } else finish(r, Object.keys(extra).length > 0);
      } catch (e) {
        setErr((e as ApiFail).message || 'Google sign-in did not work. Try again.');
      } finally {
        setBusy(false);
      }
    },
    [finish],
  );

  useEffect(() => {
    if (!CLIENT_ID) return;
    let alive = true;
    loadGsi()
      .then(() => {
        if (!alive || !box.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (r) => r.credential && void send(r.credential),
        });
        window.google.accounts.id.renderButton(box.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: mode === 'register' ? 'signup_with' : 'signin_with',
          width: Math.min(400, box.current.clientWidth || 360),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [mode, send]);

  if (!CLIENT_ID) return null;

  const submitDetails = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const age = parseInt(String(f.get('age') ?? ''), 10);
    const category = cur.category;
    const label = String(f.get('label') ?? '').trim();
    const institute = String(f.get('institute') ?? '').trim();
    const x: Record<string, string> = {};
    if (!(age >= 5 && age <= 100)) x.age = 'Enter your age, between 5 and 100.';
    if (!cur.country) x.category = 'Choose the country you study in.';
    else if (!category) x.category = 'Choose the syllabus or curriculum you study.';
    if (label.length < 2) x.label = 'Enter your class or year.';
    if (institute.length < 2) x.institute = 'Enter your school or institute.';
    if (f.get('terms') !== 'on') x.terms = 'Tick the box to continue.';
    setFieldErr(x);
    if (Object.keys(x).length) return;
    await send(credential, {
      consent: true,
      age,
      education: String(f.get('education') ?? 'college'),
      category,
      country: cur.country,
      label,
      institute,
    });
  };

  if (who)
    return (
      <form noValidate onSubmit={submitDetails} className="g-details">
        <p className="body">
          Almost done, <b>{who.name.split(' ')[0] || 'there'}</b>. Your Google account ({who.email}) is
          confirmed. Tell us a little about what you study.
        </p>
        <Field
          id="g-age"
          name="age"
          label="Your age"
          type="number"
          inputMode="numeric"
          min={5}
          max={100}
          error={fieldErr.age}
        />
        <Field
          kind="select"
          id="g-edu"
          name="education"
          label="What are you studying at?"
          options={LEVELS.map(([value, label]) => ({ value, label }))}
          defaultValue="college"
        />
        <CurriculumFields
          prefix="g"
          country={cur.country}
          category={cur.category}
          onChange={setCur}
          error={fieldErr.category}
        />
        <Field
          id="g-label"
          name="label"
          label="Class or year"
          placeholder="Class 11, or B.Tech 2nd year"
          maxLength={60}
          error={fieldErr.label}
        />
        <Field
          id="g-inst"
          name="institute"
          label="School or institute"
          autoComplete="organization"
          maxLength={120}
          error={fieldErr.institute}
        />
        <div>
          <label className="check">
            <input type="checkbox" name="terms" />
            <span>
              I agree to the <Link href="/terms">Terms</Link>, the <Link href="/privacy">Privacy policy</Link>{' '}
              and the <Link href="/ai-use">AI use notice</Link>.
            </span>
          </label>
          {fieldErr.terms ? (
            <div className="small bad" role="alert">
              {fieldErr.terms}
            </div>
          ) : null}
        </div>
        {err ? (
          <div className="small bad" role="alert">
            {err}
          </div>
        ) : null}
        <button className="btn solid lg" type="submit" disabled={busy}>
          {busy ? <Spinner size={15} /> : null} Create my account
        </button>
        <button className="btn" type="button" onClick={() => setWho(null)}>
          Use a different way to sign in
        </button>
      </form>
    );

  return (
    <div className="g-auth">
      <div className="or">or</div>
      <div ref={box} className="g-btn" aria-busy={busy} />
      {failed ? (
        <p className="small">
          Google sign-in could not load. Check your connection, or use your email and password.
        </p>
      ) : null}
      {busy ? (
        <p className="small">
          <Spinner size={13} /> Checking with Google
        </p>
      ) : null}
      {err ? (
        <p className="small bad" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
