'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeButton } from '@/components/ui/ThemeButton';
import { useApp, useHydrated } from '@/lib/store';
import { useStart, useGoSection } from '@/hooks/useStart';
import { onFrame } from '@/lib/fx/scrollFrames';

export const SITE_LINKS: [label: string, target: string][] = [
  ['Why', 'problem'],
  ['What you get', 'how'],
  ['How it works', 'quick'],
  ['Who it’s for', 'usecases'],
  ['Features', '/features'],
  ['Pricing', '/pricing'],
  ['About', '/about'],
  ['FAQ', 'faq'],
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const hydrated = useHydrated();
  const signedIn = useApp((s) => !!s.session) && hydrated;
  const start = useStart();
  const go = useGoSection();

  useEffect(() => onFrame(() => setScrolled(window.scrollY > 24)), []);

  const item = ([label, target]: [string, string]) =>
    target.startsWith('/') ? (
      <Link key={label} href={target} onClick={() => setOpen(false)}>
        {label}
      </Link>
    ) : (
      <button
        key={label}
        type="button"
        onClick={() => {
          setOpen(false);
          go(target);
        }}
      >
        {label}
      </button>
    );

  return (
    <header className={clsx('site-nav', open && 'open', scrolled && 'scrolled')}>
      <div className="wrap">
        <div className="nav-pill">
          <Link href="/" className="nav-brand" aria-label="WorkLab XC home">
            <LogoMark size={24} />
            <span>WorkLab XC</span>
          </Link>
          <nav className="nav-links" aria-label="Sections">
            {SITE_LINKS.map(item)}
          </nav>
          <div className="nav-right">
            <ThemeButton />
            {signedIn ? (
              <Link href="/app" className="btn mono ghost hide-s">
                Workspace
              </Link>
            ) : (
              <Link href="/login" className="btn mono ghost hide-s">
                Sign in
              </Link>
            )}
            <Link href="/contact" className="btn mono hide-s">
              Talk to us
            </Link>
            <span className="nav-start">
              <button className="btn mono solid" type="button" onClick={() => start('/app')}>
                Get started <Icon name="chev-r" size={13} />
              </button>
              {signedIn ? null : <i className="nav-tag">No sign-up</i>}
            </span>
            <button
              className="icon-btn nav-burger"
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              aria-controls="nav-sheet"
              onClick={() => setOpen((o) => !o)}
            >
              <Icon name={open ? 'x' : 'menu'} size={18} />
            </button>
          </div>
        </div>
        <div className={clsx('nav-sheet', open && 'show')} id="nav-sheet">
          {SITE_LINKS.map(item)}
          <Link href="/contact" onClick={() => setOpen(false)}>
            Talk to us
          </Link>
          {signedIn ? <Link href="/app">Open your workspace</Link> : <Link href="/login">Sign in</Link>}
        </div>
      </div>
    </header>
  );
}
