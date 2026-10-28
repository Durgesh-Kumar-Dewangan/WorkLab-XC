'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';

const TAGS: [string, string][] = [
  ['content', 'Content quality'],
  ['speed', 'Speed'],
  ['design', 'Slide design'],
  ['bug', 'Something broke'],
  ['pricing', 'Pricing'],
  ['other', 'Other'],
];
const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export interface FeedbackDone {
  whatsapp?: string | null;
}

/** Star rating, optional tags and comment. With a sessionId it answers the classroom feedback prompt. */
export function FeedbackForm({
  sessionId,
  page,
  onDone,
  submitLabel = 'Send feedback',
}: {
  sessionId?: string;
  page?: string;
  onDone: (r: FeedbackDone) => void;
  submitLabel?: string;
}) {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    if (!rating) return setErr('Choose a star rating first.');
    setErr('');
    setBusy(true);
    try {
      const r = await api<{ whatsapp?: string | null }>('/feedback', {
        body: { sessionId, page, rating, tags, comment: comment.trim() || undefined },
      });
      toast('Thank you. Your feedback reached the team.', 'ok');
      onDone({ whatsapp: r.whatsapp });
    } catch (e) {
      setErr((e as ApiFail).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div role="radiogroup" aria-label="Rating" className="row" style={{ gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className="icon-btn"
            style={{ color: n <= rating ? 'var(--amber)' : 'var(--fg3)' }}
            onClick={() => setRating(n)}
          >
            <Icon name="star" size={26} />
          </button>
        ))}
        <span className="small" style={{ marginLeft: 8 }} aria-live="polite">
          {WORDS[rating]}
        </span>
      </div>
      <div className="row wrap-r" style={{ gap: 8 }}>
        {TAGS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tags.includes(id)}
            className={clsx('chip', tags.includes(id) && 'blue')}
            style={{ cursor: 'pointer', background: 'none' }}
            onClick={() => setTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]))}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        className="textarea"
        rows={4}
        maxLength={2000}
        aria-label="Comment"
        placeholder="What worked, what did not, what should we build next? (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {err ? (
        <div className="callout warn" role="alert">
          <Icon name="alert" size={16} />
          <span>{err}</span>
        </div>
      ) : null}
      <button className="btn solid" type="button" disabled={busy} onClick={send}>
        {busy ? <Spinner size={14} /> : submitLabel}
      </button>
    </div>
  );
}
