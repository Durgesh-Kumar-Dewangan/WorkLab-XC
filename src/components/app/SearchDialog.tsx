'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NAV } from './nav';
import { allCourses, topicTitle } from '@/lib/domain/courses';
import { getApp } from '@/lib/store';
import { clamp } from '@/lib/util';

interface Hit {
  label: string;
  sub: string;
  to: string;
}

function buildIndex(): Hit[] {
  const d = getApp();
  const idx: Hit[] = [
    ...NAV.map(([l, to]) => ({ label: l, sub: 'Page', to })),
    { label: 'Settings', sub: 'Page', to: '/app/settings' },
    { label: 'Profile', sub: 'Page', to: '/app/profile' },
    { label: 'Notifications', sub: 'Page', to: '/app/notifications' },
  ];
  allCourses(d).forEach((c) => {
    idx.push({ label: c.title, sub: 'Course', to: `/app/courses/${c.id}` });
    c.order.forEach((id) =>
      idx.push({
        label: topicTitle(d, c, id),
        sub: `Topic in ${c.title}`,
        to: `/app/courses/${c.id}/topics/${id}`,
      }),
    );
  });
  return idx;
}

export function SearchDialog({ onPick }: { onPick: (to: string) => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const idx = useMemo(buildIndex, []);
  const input = useRef<HTMLInputElement>(null);

  const res = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (
      t
        ? idx.filter((x) => `${x.label} ${x.sub}`.toLowerCase().includes(t))
        : idx.filter((x) => !x.sub.startsWith('Topic'))
    ).slice(0, 9);
  }, [q, idx]);
  const s = clamp(sel, 0, Math.max(0, res.length - 1));

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        ref={input}
        className="input"
        type="search"
        placeholder="Search pages, courses and topics"
        aria-label="Search"
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSel(Math.min(res.length - 1, s + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel(Math.max(0, s - 1));
          } else if (e.key === 'Enter' && res[s]) {
            e.preventDefault();
            onPick(res[s].to);
          }
        }}
      />
      <div className="list" role="listbox" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
        {res.length ? (
          res.map((r, i) => (
            <button
              key={r.to + r.label}
              type="button"
              role="option"
              aria-selected={i === s}
              className="li link"
              style={{
                textAlign: 'left',
                width: '100%',
                background: i === s ? 'var(--panel2)' : 'transparent',
                borderRadius: 10,
                padding: '10px 12px',
                border: 0,
              }}
              onClick={() => onPick(r.to)}
              onMouseMove={() => setSel(i)}
            >
              <div className="grow">
                <div className="t">{r.label}</div>
                <div className="s">{r.sub}</div>
              </div>
              <Icon name="arrow-r" size={14} />
            </button>
          ))
        ) : (
          <div className="small" style={{ padding: '14px 12px' }}>
            No match for “{q}”. Try a topic name such as “energy”.
          </div>
        )}
      </div>
    </div>
  );
}
