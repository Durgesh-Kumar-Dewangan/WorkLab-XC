'use client';

import { useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Field } from '@/components/ui/controls';
import { submitLead } from '@/lib/plans';
import { toast } from '@/lib/ui/toast';

const EMAIL = /^\S+@\S+\.\S+$/;

export function ContactForm({ prefill = 'student' }: { prefill?: string }) {
  const [errs, setErrs] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { first: string }>(null);
  const [failed, setFailed] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('ct-name') ?? '').trim();
    const email = String(f.get('ct-email') ?? '').trim();
    const next = {
      name: name ? undefined : 'Enter your name.',
      email: EMAIL.test(email) ? undefined : 'Enter an email like name@example.com.',
    };
    setErrs(next);
    if (next.name || next.email) return;
    const payload = {
      name,
      email,
      role: String(f.get('ct-role') ?? 'student'),
      message: String(f.get('ct-msg') ?? '').trim(),
      at: Date.now(),
    };
    setBusy(true);
    const sent = await submitLead(payload);
    setBusy(false);
    if (!sent) {
      setFailed(true);
      toast('Could not send your request. Try again.', 'err');
      return;
    }
    setFailed(false);
    setDone({ first: name.split(' ')[0] });
    toast('Request sent');
  };

  return (
    <form className="ct-form" noValidate onSubmit={onSubmit}>
      <div className="ct-two">
        <Field
          id="ct-name"
          name="ct-name"
          label="Your name"
          required
          autoComplete="name"
          error={errs.name}
          disabled={busy}
        />
        <Field
          id="ct-email"
          name="ct-email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@school.edu"
          error={errs.email}
          disabled={busy}
        />
      </div>
      <Field
        kind="select"
        id="ct-role"
        name="ct-role"
        label="I am a"
        defaultValue={prefill}
        disabled={busy}
        options={[
          { value: 'student', label: 'Student' },
          { value: 'teacher', label: 'Teacher' },
          { value: 'learner', label: 'Self-learner' },
          { value: 'classroom', label: 'Running a class or school' },
        ]}
      />
      <Field
        kind="textarea"
        id="ct-msg"
        name="ct-msg"
        label="What would you like to see?"
        rows={4}
        placeholder="The course you would try first, or what you want it to do."
        disabled={busy}
      />
      <div className="ct-act">
        <button className="btn solid lg" type="submit" disabled={busy}>
          Send request <Icon name="chev-r" size={13} />
        </button>
        <span className="small">We reply by email.</span>
      </div>
      {done ? (
        <div className="ct-done" role="status">
          <Icon name="check" size={16} />
          <span>
            {`Thanks, ${done.first}. We have your request and will reply by email.`}
          </span>
        </div>
      ) : null}
      {failed ? (
        <div className="ct-done" role="alert">
          <Icon name="alert" size={16} />
          <span>Your request could not be sent. Check your connection and try again.</span>
        </div>
      ) : null}
    </form>
  );
}
