'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Spinner } from '@/components/ui/Icon';
import { Field } from '@/components/ui/controls';
import { AuthShell } from './AuthShell';
import { GoogleAuth } from './GoogleAuth';
import { TurnstileBox } from '@/components/auth/Turnstile';
import { api } from '@/lib/api/client';
import { accountRegister, EMAIL_RE, passScore } from '@/lib/auth';
import { CurriculumFields } from '@/components/app/CurriculumFields';
import { useApp } from '@/lib/store';
import { toast } from '@/lib/ui/toast';

const LEVELS = ['Secondary school', 'Undergraduate', 'Postgraduate', 'Self-study', 'Teaching others'];
const EDUCATION: Record<string, string> = {
  'Secondary school': 'school',
  Undergraduate: 'college',
  Postgraduate: 'college',
  'Self-study': 'self',
  'Teaching others': 'professional',
};
const GOALS = [
  ['exam', 'Pass an exam'],
  ['school', 'Do better in school or college'],
  ['career', 'Grow in my career'],
  ['curiosity', 'Learn out of curiosity'],
  ['teach', 'Teach others'],
] as const;
const DAILY = [
  [20, 'Casual', '20 points a day'],
  [30, 'Regular', '30 points a day'],
  [50, 'Serious', '50 points a day'],
  [80, 'Intense', '80 points a day'],
] as const;
type Errs = Partial<
  Record<
    | 'name'
    | 'username'
    | 'goal'
    | 'email'
    | 'pw'
    | 'pw2'
    | 'terms'
    | 'age'
    | 'category'
    | 'label'
    | 'institute',
    string
  >
>;
type NameState = { state: 'idle' | 'checking' | 'ok' | 'bad'; msg: string };

export function RegisterForm() {
  const router = useRouter();
  const { signIn, updateProfile, notify } = useApp.getState();
  const [errs, setErrs] = useState<Errs>({});
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(0);
  const [daily, setDaily] = useState<number>(30);
  const [cur, setCur] = useState({ country: '', category: '' });
  const [uname, setUname] = useState<NameState>({ state: 'idle', msg: '' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  // is this username free? asked a moment after the person stops typing
  const checkName = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    const n = v.trim().toLowerCase();
    if (!n) return setUname({ state: 'idle', msg: '' });
    if (!/^[a-z0-9_]{3,24}$/.test(n))
      return setUname({ state: 'bad', msg: 'Use 3 to 24 letters, numbers or underscores.' });
    setUname({ state: 'checking', msg: 'Checking...' });
    timer.current = setTimeout(() => {
      api<{ valid: boolean; reason: string; available: boolean }>(`/auth/username?u=${encodeURIComponent(n)}`)
        .then((r) =>
          setUname(
            r.available
              ? { state: 'ok', msg: `${n} is yours if you want it.` }
              : { state: 'bad', msg: r.reason || 'That username is taken.' },
          ),
        )
        .catch(() => setUname({ state: 'idle', msg: '' }));
    }, 400);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const nv = String(f.get('name') ?? '').trim();
    const ev = String(f.get('email') ?? '').trim();
    const p1 = String(f.get('password') ?? '');
    const p2 = String(f.get('password2') ?? '');
    const level = String(f.get('level') ?? 'Undergraduate');
    const age = parseInt(String(f.get('age') ?? ''), 10);
    const agreed = f.get('terms') === 'on';
    const x: Errs = {};
    const username = String(f.get('username') ?? '')
      .trim()
      .toLowerCase();
    const goal = String(f.get('goal') ?? '');
    if (!/^[a-z0-9_]{3,24}$/.test(username))
      x.username = 'Choose a username of 3 to 24 letters, numbers or underscores.';
    else if (uname.state === 'bad') x.username = uname.msg;
    if (!goal) x.goal = 'Tell us why you are learning.';
    if (nv.length < 2) x.name = 'Enter your name so we can greet you.';
    if (!ev) x.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(ev)) x.email = 'That email address looks incomplete. Try name@example.com.';
    if (p1.length < 8) x.pw = 'Use at least 8 characters.';
    else if (passScore(p1) < 2) x.pw = 'Add an uppercase letter or a digit to make it harder to guess.';
    if (p2 !== p1) x.pw2 = 'The two passwords do not match.';
    if (!(age >= 5 && age <= 100)) x.age = 'Enter your age, between 5 and 100.';
    const category = cur.category;
    const country = cur.country;
    const label = String(f.get('label') ?? '').trim();
    const institute = String(f.get('institute') ?? '').trim();
    if (!country) x.category = 'Choose the country you study in.';
    else if (!category) x.category = 'Choose the syllabus or curriculum you study.';
    if (label.length < 2) x.label = 'Enter your class or year.';
    if (institute.length < 2) x.institute = 'Enter your school or institute.';
    if (!agreed) x.terms = 'Tick the box to continue.';
    setErrs(x);
    if (Object.keys(x).length) return;
    setBusy(true);
    const r = await accountRegister(nv, ev, p1, true, {
      age,
      education: EDUCATION[level] ?? 'college',
      category,
      country,
      label,
      institute,
      username,
      goal,
      dailyGoal: daily,
    });
    if (!r.ok) {
      setBusy(false);
      if (r.field === 'username') setUname({ state: 'bad', msg: r.msg });
      return setErrs({ [r.field === 'username' ? 'username' : 'email']: r.msg });
    }
    setBusy(false);
    signIn({ name: r.name, email: r.email });
    updateProfile({ name: nv, email: ev, level, age });
    notify(
      'system',
      `Welcome to WorkLab XC, ${nv.split(' ')[0]}`,
      'Upload a syllabus to build your first course.',
      '/app/upload',
    );
    toast(`Account created. Welcome, ${nv.split(' ')[0]}.`, 'ok');
    const n = new URLSearchParams(window.location.search).get('next');
    router.push(n && n.startsWith('/') && !n.startsWith('//') ? n : '/app');
  };

  return (
    <AuthShell mode="register">
      <div>
        <h1 className="h1">Create your account</h1>
        <p className="body" style={{ marginTop: 8 }}>
          A private workspace for your courses, syllabi and progress.
        </p>
      </div>
      <form noValidate onSubmit={onSubmit}>
        <Field
          id="rg-name"
          name="name"
          label="Full name"
          autoComplete="name"
          placeholder="Asha Verma"
          error={errs.name}
        />
        <div>
          <Field
            id="rg-username"
            name="username"
            label="Choose a username"
            autoComplete="username"
            placeholder="asha_verma"
            maxLength={24}
            error={errs.username}
            hint="Unique to you. It is your name on the leaderboard, and you can sign in with it."
            onInput={(e) => checkName((e.target as HTMLInputElement).value)}
          />
          {uname.state !== 'idle' && !errs.username ? (
            <div
              className={clsx('small', uname.state === 'bad' ? 'bad' : uname.state === 'ok' ? 'good' : 'dim')}
              role="status"
            >
              {uname.msg}
            </div>
          ) : null}
        </div>
        <Field
          id="rg-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errs.email}
        />
        <div>
          <Field
            id="rg-pw"
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            hint="Use 8 or more characters. Mix cases, digits and symbols for a stronger one."
            error={errs.pw}
            onInput={(e) => setScore(passScore((e.target as HTMLInputElement).value))}
          />
          <div className="strength" aria-hidden="true">
            {[0, 1, 2, 3].map((k) => (
              <i key={k} className={clsx(k < score && `on${score}`)} />
            ))}
          </div>
        </div>
        <Field
          id="rg-pw2"
          name="password2"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errs.pw2}
        />
        <Field
          id="rg-age"
          name="age"
          label="Your age"
          type="number"
          inputMode="numeric"
          min={5}
          max={100}
          error={errs.age}
          hint="Helps us pitch lessons at the right level."
          required
        />
        <Field
          kind="select"
          id="rg-goal"
          name="goal"
          label="Why are you learning?"
          options={[{ value: '', label: 'Choose one' }, ...GOALS.map(([v, l]) => ({ value: v, label: l }))]}
          defaultValue=""
          error={errs.goal}
        />
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Your daily goal</legend>
          <div className="rg-goals" role="radiogroup" aria-label="Daily goal">
            {DAILY.map(([v, name, note]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={daily === v}
                className={clsx('rg-goal', daily === v && 'on')}
                onClick={() => setDaily(v)}
              >
                <b>{name}</b>
                <small>{note}</small>
              </button>
            ))}
          </div>
          <p className="small">Reach it each day to grow your streak. You can change it later.</p>
        </fieldset>
        <Field
          kind="select"
          id="rg-level"
          name="level"
          label="What are you studying at?"
          options={LEVELS}
          defaultValue="Undergraduate"
        />
        {true ? (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">What you study</legend>
            <CurriculumFields
              prefix="rg"
              country={cur.country}
              category={cur.category}
              onChange={setCur}
              error={errs.category}
              hint="Pick your country, then your syllabus. So we can reuse lessons made for the same one."
            />
            <Field
              id="rg-label"
              name="label"
              label="Class or year"
              placeholder="Class 11, or B.Tech 2nd year"
              maxLength={60}
              error={errs.label}
            />
            <Field
              id="rg-institute"
              name="institute"
              label="School or institute"
              autoComplete="organization"
              maxLength={120}
              error={errs.institute}
            />
            <p className="small">
              Used to personalise lessons and to run the service. See what we collect on the{' '}
              <Link href="/privacy">Privacy page</Link>.
            </p>
          </fieldset>
        ) : null}
        <div>
          <label className="check">
            <input type="checkbox" id="rg-terms" name="terms" />
            <span>
              I agree to the <Link href="/terms">Terms</Link>, the <Link href="/privacy">Privacy policy</Link>{' '}
              and the <Link href="/ai-use">AI use notice</Link>.
            </span>
          </label>
          {errs.terms ? (
            <div className="small bad" role="alert">
              {errs.terms}
            </div>
          ) : null}
        </div>
        <TurnstileBox />
        <button className="btn solid lg" type="submit" id="rg-submit" disabled={busy}>
          {busy ? (
            <>
              <Spinner size={15} /> Creating account
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>
      <GoogleAuth mode="register" />
      <p className="small">
        Already registered?{' '}
        <Link href="/login" style={{ textDecoration: 'underline' }}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
