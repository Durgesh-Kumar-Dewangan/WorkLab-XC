'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/ui/controls';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail, hasBackend } from '@/lib/api/client';
import { useServerMe } from '@/hooks/useServerMe';
import { clearAssets } from '@/lib/assets/store';
import { useApp } from '@/lib/store';
import { closeModal, openModal } from '@/lib/ui/modal';
import { toast } from '@/lib/ui/toast';

type SectionC = ComponentType<{ title: string; children: ReactNode }>;
type RowC = ComponentType<{ title: string; desc: string; children: ReactNode }>;

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (next.length < 8) return setErr('Use at least 8 characters for the new password.');
        setBusy(true);
        setErr('');
        try {
          await api('/auth/change-password', { body: { current: cur, password: next } });
          toast('Password changed. Other devices were signed out.', 'ok');
          onDone();
        } catch (x) {
          setErr((x as ApiFail).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={cur}
        onChange={(e) => setCur(e.target.value)}
      />
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={err}
        hint="At least 8 characters."
      />
      <button className="btn solid" type="submit" disabled={busy}>
        {busy ? <Spinner size={14} /> : 'Change password'}
      </button>
    </form>
  );
}

function DeleteAccount({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      noValidate
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr('');
        try {
          await api('/me', { method: 'DELETE', body: { password: pw } });
          onDone();
        } catch (x) {
          setErr((x as ApiFail).message);
          setBusy(false);
        }
      }}
    >
      <p className="body">
        This permanently deletes your account, courses, decks and sessions. Payment records are kept as the
        law requires. Download your data first if you want a copy.
      </p>
      <Field
        label="Confirm with your password"
        type="password"
        autoComplete="current-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        error={err}
      />
      <button className="btn danger" type="submit" disabled={busy || !pw}>
        {busy ? <Spinner size={14} /> : 'Delete my account forever'}
      </button>
    </form>
  );
}

/** Account controls that only exist with a server: plan, email, password, data download and deletion. */
export function AccountSection({ Section, Row }: { Section: SectionC; Row: RowC }) {
  const router = useRouter();
  const signOut = useApp((s) => s.signOut);
  const resetAll = useApp((s) => s.resetAll);
  const { me } = useServerMe();
  if (!hasBackend()) return null;
  const u = me?.user;
  return (
    <Section title="Account">
      <Row
        title="Plan"
        desc={
          u
            ? `${u.plan === 'prototype' ? 'Free' : u.plan === 'learner' ? 'Beta' : u.plan[0].toUpperCase() + u.plan.slice(1)}${u.planUntil ? ` until ${new Date(u.planUntil).toLocaleDateString()}` : ''}`
            : 'Loading…'
        }
      >
        <a className="btn" href="/pricing">
          Plans
        </a>
      </Row>
      <Row
        title="Email"
        desc={u ? `${u.email} · ${u.emailVerified ? 'confirmed' : 'not confirmed yet'}` : 'Loading…'}
      >
        {u && !u.emailVerified ? (
          <button
            className="btn"
            type="button"
            onClick={() =>
              api('/auth/resend-verification', { body: {} })
                .then(() => toast('Confirmation email sent.', 'ok'))
                .catch((e: ApiFail) => toast(e.message, 'err'))
            }
          >
            Send link
          </button>
        ) : (
          <Icon name="check" size={18} />
        )}
      </Row>
      <Row title="Password" desc="Changing it signs out your other devices.">
        <button
          className="btn"
          type="button"
          onClick={() => {
            const m = openModal({
              title: 'Change password',
              body: <ChangePassword onDone={() => closeModal(m.id)} />,
            });
          }}
        >
          Change
        </button>
      </Row>
      <Row
        title="Download my data"
        desc="Your profile, courses, runs, feedback and payments as one JSON file."
      >
        <a className="btn" href="/api/me/export" download>
          <Icon name="file-text" size={15} /> Download
        </a>
      </Row>
      <Row title="Delete account" desc="Removes your account and everything on the server.">
        <button
          className="btn danger"
          type="button"
          onClick={() => {
            const m = openModal({
              title: 'Delete your account?',
              body: (
                <DeleteAccount
                  onDone={async () => {
                    closeModal(m.id);
                    await clearAssets();
                    resetAll();
                    signOut();
                    toast('Your account was deleted.', 'ok');
                    router.push('/');
                  }}
                />
              ),
            });
          }}
        >
          Delete
        </button>
      </Row>
    </Section>
  );
}
