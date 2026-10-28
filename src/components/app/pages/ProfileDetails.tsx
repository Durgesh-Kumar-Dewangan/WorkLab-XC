'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field } from '@/components/ui/controls';
import { Spinner } from '@/components/ui/Icon';
import { api, ApiFail, hasBackend } from '@/lib/api/client';
import { CurriculumFields } from '@/components/app/CurriculumFields';
import { AGE_OPTIONS, EDUCATION_OPTIONS } from '@/lib/profile-options';
import { toast } from '@/lib/ui/toast';

interface Profile {
  education: string;
  category: string;
  country?: string;
  label: string;
  institute: string;
  city: string;
  state: string;
  rank: string;
  ageBand: string;
  language: string;
  handle: string;
  bio: string;
  publicProfile: boolean;
  leaderboard: boolean;
}

/** Learner details kept on the server: syllabus, school, rank, and what is visible to other learners. */
export function ProfileDetails() {
  const [p, setP] = useState<Profile | null>(null);
  const [consent, setConsent] = useState<{ at: number; version: string } | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!hasBackend()) return;
    api<{ profile: Profile; consent: { at: number; version: string } | null }>('/profile')
      .then((r) => {
        setP(r.profile);
        setConsent(r.consent);
      })
      .catch((e: ApiFail) => toast(e.message, 'err'));
  }, []);
  if (!hasBackend() || !p) return null;
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((x) => (x ? { ...x, [k]: v } : x));

  const suggest = (q: string) => {
    set('institute', q);
    clearTimeout(timer.current);
    if (q.trim().length < 2) return setHints([]);
    timer.current = setTimeout(() => {
      api<{ institutes: string[] }>(`/institutes?q=${encodeURIComponent(q)}`)
        .then((r) => setHints(r.institutes))
        .catch(() => setHints([]));
    }, 250);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr({});
    try {
      const r = await api<{ profile: Profile }>('/profile', { method: 'PUT', body: p });
      setP(r.profile);
      toast('Details saved.', 'ok');
    } catch (x) {
      const f = x as ApiFail;
      setErr(
        f.code === 'handle_taken' || f.code === 'bad_handle' || f.code === 'handle_required'
          ? { handle: f.message }
          : {},
      );
      toast(f.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form noValidate className="card" onSubmit={submit} aria-labelledby="pd-h">
      <h2 className="h3" id="pd-h">
        About your studies
      </h2>
      <p className="small">
        We use this to reuse lessons for your syllabus and to help support you. You can leave anything blank.{' '}
        <a href="/privacy">What we collect and why</a>.
      </p>
      <Field
        kind="select"
        id="pd-edu"
        label="You are in"
        options={EDUCATION_OPTIONS}
        value={p.education}
        onChange={(e) => set('education', e.target.value)}
      />
      <CurriculumFields
        prefix="pd"
        country={p.country ?? ''}
        category={p.category}
        onChange={(n) => setP((x) => (x ? { ...x, ...n } : x))}
      />
      <Field
        id="pd-label"
        label="Class or year"
        maxLength={60}
        value={p.label}
        onChange={(e) => set('label', e.target.value)}
      />
      <div className="field">
        <Field
          id="pd-inst"
          label="School or institute"
          maxLength={120}
          autoComplete="organization"
          list="pd-inst-list"
          value={p.institute}
          onChange={(e) => suggest(e.target.value)}
        />
        <datalist id="pd-inst-list">
          {hints.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </div>
      <div className="g2">
        <Field
          id="pd-city"
          label="City"
          maxLength={60}
          value={p.city}
          onChange={(e) => set('city', e.target.value)}
        />
        <Field
          id="pd-state"
          label="State"
          maxLength={60}
          value={p.state}
          onChange={(e) => set('state', e.target.value)}
        />
      </div>
      <Field
        id="pd-rank"
        label="Your rank or standing"
        maxLength={40}
        hint="For example 'Rank 12 in class' or 'AIR 4500'. Only you and the WorkLab XC team see it."
        value={p.rank}
        onChange={(e) => set('rank', e.target.value)}
      />
      <Field
        kind="select"
        id="pd-age"
        label="Age group"
        options={AGE_OPTIONS}
        value={p.ageBand}
        onChange={(e) => set('ageBand', e.target.value)}
      />
      <h3 className="h3" style={{ marginTop: 16 }}>
        Your learner profile
      </h3>
      <Field
        id="pd-handle"
        label="Handle"
        maxLength={24}
        placeholder="asha_k"
        hint="3 to 24 letters, numbers or underscores."
        error={err.handle}
        value={p.handle}
        onChange={(e) => set('handle', e.target.value.toLowerCase())}
      />
      <Field
        kind="textarea"
        id="pd-bio"
        label="Short bio"
        rows={2}
        maxLength={240}
        value={p.bio}
        onChange={(e) => set('bio', e.target.value)}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={p.publicProfile}
          onChange={(e) => set('publicProfile', e.target.checked)}
        />
        <span>
          Let other learners find my profile and follow me. Shows my name, handle, bio, school and progress
          points.
        </span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={p.leaderboard}
          onChange={(e) => set('leaderboard', e.target.checked)}
        />
        <span>Show me on the leaderboard.</span>
      </label>
      {consent ? (
        <p className="small">
          You accepted the Terms and Privacy policy (version {consent.version}) on{' '}
          {new Date(consent.at).toLocaleDateString()}.
        </p>
      ) : null}
      <div>
        <button className="btn solid" type="submit" disabled={busy}>
          {busy ? (
            <>
              <Spinner size={14} /> Saving
            </>
          ) : (
            'Save details'
          )}
        </button>
      </div>
    </form>
  );
}
