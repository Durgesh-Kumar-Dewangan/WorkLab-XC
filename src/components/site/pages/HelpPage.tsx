'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { PageShell } from '@/components/site/PageShell';
import { FAQ, FAQ_COUNT } from '@/lib/faq';

/** One question as a card with a Show answer button, the same as the questions on the home page. */
function QaCard({ q, a, startOpen }: { q: string; a: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  useEffect(() => setOpen(startOpen), [startOpen]);
  return (
    <div className="qa">
      <h3>{q}</h3>
      <button type="button" className="tg" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{open ? 'Hide answer' : 'Show answer'}</span>
        <Icon name={open ? 'minus' : 'plus'} size={14} />
      </button>
      <p className="ans" hidden={!open}>
        {a}
      </p>
    </div>
  );
}

/** The help centre: every common question, grouped, searchable, with a way to reach a person when the answer is not here. */
export function HelpPage() {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const needle = q.trim().toLowerCase();

  const shown = useMemo(
    () =>
      FAQ.filter((g) => group === 'all' || g.id === group)
        .map((g) => ({
          ...g,
          items: g.items.filter(([a, b]) => !needle || a.toLowerCase().includes(needle) || b.toLowerCase().includes(needle)),
        }))
        .filter((g) => g.items.length),
    [needle, group],
  );
  const hits = shown.reduce((n, g) => n + g.items.length, 0);

  return (
    <PageShell label="Help centre" title="Answers to common questions." lead={`${FAQ_COUNT} answers, from your first syllabus to payments. Search, or pick a topic.`}>
      <div className="hc-search">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: upload, payment, black screen, refund…"
          aria-label="Search the help centre"
        />
      </div>
      <div className="hc-tabs" role="tablist" aria-label="Help topics">
        <button type="button" role="tab" aria-selected={group === 'all'} className={clsx(group === 'all' && 'on')} onClick={() => setGroup('all')}>
          All
        </button>
        {FAQ.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className={clsx(group === g.id && 'on')} onClick={() => setGroup(g.id)}>
            {g.title}
          </button>
        ))}
      </div>

      {needle ? <p className="small" role="status">{hits ? `${hits} ${hits === 1 ? 'answer' : 'answers'} for “${q.trim()}”` : `Nothing matches “${q.trim()}”.`}</p> : null}

      {shown.map((g) => (
        <section key={g.id} className="hc-group" aria-labelledby={`hc-${g.id}`}>
          <h2 className="h3" id={`hc-${g.id}`}>
            {g.title}
          </h2>
          <div className="faq-list">
            {g.items.map(([a, b]) => (
              <QaCard key={a} q={a} a={b} startOpen={!!needle && hits <= 4} />
            ))}
          </div>
        </section>
      ))}

      <div className="hc-more card">
        <div>
          <h2 className="h3">Still stuck?</h2>
          <p className="body">Write to us in the Support chat inside your account, or use the contact form if you are not signed in. We reply in the same place, and you never share a phone number.</p>
        </div>
        <div className="row wrap-r">
          <Link href="/app/support" className="btn solid">
            <Icon name="msg" size={15} /> Open Support
          </Link>
          <Link href="/contact" className="btn">
            Contact form
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
