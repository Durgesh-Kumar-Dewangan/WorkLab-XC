'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const slug = (s: string) => 'set-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The Settings layout: a sticky list of sections on the left (it highlights the section you are reading) and a search box that
 * hides every setting that does not match. The sections are found in the page itself, so adding a section needs no list to update.
 */
export function SettingsShell({ children }: { children: ReactNode }) {
  const main = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<{ id: string; title: string }[]>([]);
  const [active, setActive] = useState('');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState<number | null>(null);

  // find the sections after every render, so the list follows what is on the page
  useEffect(() => {
    const secs = [...(main.current?.querySelectorAll<HTMLElement>('section.card[aria-label]') ?? [])];
    secs.forEach((s) => (s.id = slug(s.getAttribute('aria-label') || '')));
    const next = secs.map((s) => ({ id: s.id, title: s.getAttribute('aria-label') || '' }));
    setItems((cur) => (cur.map((c) => c.id).join() === next.map((c) => c.id).join() ? cur : next));
  });

  useEffect(() => {
    const secs = [...(main.current?.querySelectorAll<HTMLElement>('section.card[aria-label]') ?? [])];
    if (!secs.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (es) => {
        const top = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    secs.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [items.length]);

  // the search: a setting stays if its words contain what was typed; a section with nothing left is hidden
  useEffect(() => {
    const term = q.trim().toLowerCase();
    let visible = 0;
    main.current?.querySelectorAll<HTMLElement>('section.card[aria-label]').forEach((sec) => {
      const rows = [...sec.querySelectorAll<HTMLElement>('.setrow')];
      let any = !term;
      rows.forEach((r) => {
        const hit = !term || (r.textContent || '').toLowerCase().includes(term) || (sec.getAttribute('aria-label') || '').toLowerCase().includes(term);
        r.hidden = !hit;
        if (hit) any = true;
      });
      sec.hidden = !any;
      if (any) visible += rows.filter((r) => !r.hidden).length;
    });
    setShown(term ? visible : null);
  }, [q, children]);

  return (
    <div className="sx">
      <aside className="sx-nav" aria-label="Settings sections">
        <label className="sx-search">
          <span className="sr-only">Search settings</span>
          <input type="search" className="input" placeholder="Search settings" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <nav>
          {items.map((i) => (
            <a key={i.id} href={`#${i.id}`} className={active === i.id ? 'on' : ''} aria-current={active === i.id ? 'true' : undefined}>
              {i.title}
            </a>
          ))}
        </nav>
      </aside>
      <div className="sx-main" ref={main}>
        {shown === 0 ? <p className="small">Nothing matches “{q}”. Try a shorter word, such as theme, voice or email.</p> : null}
        {children}
      </div>
    </div>
  );
}
