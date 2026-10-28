'use client';

import { useRef, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Field } from '@/components/ui/controls';
import { Icon, Spinner } from '@/components/ui/Icon';
import { ProfilePhoto } from '@/components/ui/Avatar';
import { useServerMe } from '@/hooks/useServerMe';
import { api, ApiFail } from '@/lib/api/client';
import { useApp } from '@/lib/store';
import { useCourses } from '@/lib/store/hooks';
import { streakDays } from '@/lib/domain/stats';
import { toast } from '@/lib/ui/toast';
import { ProfileDetails } from './ProfileDetails';

const ACCENTS = ['#7c4dff', '#2f7bff', '#d46bff', '#12a150', '#e58a00', '#e5484d'];
const LEVELS = ['Secondary school', 'Undergraduate', 'Postgraduate', 'Self-study', 'Teaching others'];

/** Crops the middle square of a picture and shrinks it to 256px, so the stored photo stays small. */
function toAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not a picture we can read.'));
    };
    img.src = url;
  });
}

export function ProfilePage() {
  const P = useApp((s) => s.profile);
  const session = useApp((s) => s.session);
  const minutes = useApp((s) => s.minutes);
  const mastery = useApp((s) => s.mastery);
  const update = useApp((s) => s.updateProfile);
  const courses = useCourses();
  const { me } = useServerMe();
  const pick = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [f, setF] = useState({ name: P.name, age: P.age ? String(P.age) : '', level: P.level, goal: P.goal, mins: String(P.minutesPerDay), color: P.color });
  const [err, setErr] = useState<Partial<Record<'name' | 'age' | 'mins', string>>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const savePhoto = async (photo: string) => {
    setPhotoBusy(true);
    try {
      await api('/profile', { method: 'PUT', body: { photo } });
      update({ photo });
      toast(photo ? 'Photo updated' : 'Photo removed', 'ok');
    } catch (e) {
      toast((e as ApiFail).message, 'err');
    } finally {
      setPhotoBusy(false);
    }
  };
  const onPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Choose a picture file.', 'err');
    try {
      await savePhoto(await toAvatar(file));
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const m = parseInt(f.mins, 10);
    const age = f.age.trim() ? parseInt(f.age, 10) : 0;
    const next = {
      name: f.name.trim().length < 2 ? 'Enter your name.' : '',
      age: f.age.trim() && !(age >= 5 && age <= 100) ? 'Enter an age between 5 and 100, or leave it blank.' : '',
      mins: m >= 5 && m <= 600 ? '' : 'Choose between 5 and 600 minutes.',
    };
    setErr(next);
    if (next.name || next.age || next.mins) return;
    setSaving(true);
    try {
      await api('/profile', { method: 'PUT', body: { name: f.name.trim(), age } });
      update({ name: f.name.trim(), age, level: f.level, goal: f.goal.trim(), minutesPerDay: m, color: f.color });
      toast('Profile saved', 'ok');
    } catch (x) {
      toast((x as ApiFail).message, 'err');
    } finally {
      setSaving(false);
    }
  };

  const total = Object.values(minutes as Record<string, number>).reduce((a, b) => a + b, 0);
  const plan = me?.user.plan === 'learner' ? 'Beta' : me?.user.plan === 'classroom' ? 'Classroom' : 'Free';

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Profile</h1>
          {streakDays(minutes) > 0 ? (
            <p className="streak-line">
              <Icon name="flame" size={16} /> {`${streakDays(minutes)} day streak`}
            </p>
          ) : null}
          <p className="sub">Your details shape your suggestions. They are saved to your account.</p>
        </div>
      </div>

      <div className="card pf-hero">
        <div className="pf-photo">
          <ProfilePhoto name={P.name} photo={P.photo} color={f.color} size={104} />
          {photoBusy ? (
            <span className="pf-busy" role="status">
              <Spinner size={20} />
            </span>
          ) : null}
        </div>
        <div className="pf-id">
          <div className="pf-name">{P.name || 'Learner'}</div>
          <div className="small">{P.email}</div>
          <div className="row wrap-r" style={{ gap: 8, marginTop: 8 }}>
            <span className="chip">{`${plan} plan`}</span>
            {P.age ? <span className="chip">{`Age ${P.age}`}</span> : null}
            <span className="chip">{`Since ${session ? new Date(session.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}`}</span>
          </div>
          <div className="row wrap-r" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn sm solid" type="button" disabled={photoBusy} onClick={() => pick.current?.click()}>
              <Icon name="upload" size={14} />
              {P.photo ? 'Change photo' : 'Add a photo'}
            </button>
            {P.photo ? (
              <button className="btn sm" type="button" disabled={photoBusy} onClick={() => void savePhoto('')}>
                Remove
              </button>
            ) : null}
            <input ref={pick} type="file" accept="image/*" className="sr" tabIndex={-1} onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
        <dl className="kv pf-stats">
          <dt>Courses</dt>
          <dd>{courses.length}</dd>
          <dt>Topics practised</dt>
          <dd>{Object.keys(mastery).length}</dd>
          <dt>Time studied</dt>
          <dd>{`${Math.round(total)} min`}</dd>
        </dl>
      </div>

      <div className="g21">
        <form noValidate className="card" onSubmit={submit}>
          <h2 className="h3">Personal details</h2>
          <Field label="Full name" id="pf-name" autoComplete="name" value={f.name} error={err.name} onChange={(e) => set('name', e.target.value)} />
          <Field label="Email" type="email" id="pf-email" value={P.email} readOnly hint="Your sign-in email. To change it, contact support." />
          <div className="g2">
            <Field label="Age" type="number" id="pf-age" inputMode="numeric" min={5} max={100} value={f.age} error={err.age} onChange={(e) => set('age', e.target.value)} />
            <Field kind="select" label="Studying at" id="pf-level" options={LEVELS} value={f.level} onChange={(e) => set('level', e.target.value)} />
          </div>
          <Field kind="textarea" label="What do you want from your courses?" id="pf-goal" rows={3} hint="Shown on your dashboard. Only you see it." value={f.goal} onChange={(e) => set('goal', e.target.value)} />
          <Field label="Daily study goal (minutes)" type="number" id="pf-min" inputMode="numeric" value={f.mins} error={err.mins} onChange={(e) => set('mins', e.target.value)} />
          {!P.photo ? (
            <div className="field">
              <label id="pf-colour">Picture colour</label>
              <div className="swatches" role="group" aria-labelledby="pf-colour">
                {ACCENTS.map((c) => (
                  <button key={c} type="button" style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={c === f.color} className={clsx(c === f.color && 'on')} onClick={() => set('color', c)} />
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <button className="btn solid" type="submit" disabled={saving}>
              {saving ? <Spinner size={14} /> : 'Save changes'}
            </button>
          </div>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ProfileDetails />
          <div className="callout">
            <Icon name="shield" size={18} />
            <span>Your photo and age are private to you. Only the handle and bio you choose to make public are shown to other learners.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
