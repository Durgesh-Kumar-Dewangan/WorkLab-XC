'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeButton } from '@/components/ui/ThemeButton';
import { Halftone } from '@/components/fx/Halftone';
import { paintClassroom } from '@/lib/fx/painters';
import { useApp, useHydrated } from '@/lib/store';

const PTS: [string, string, string][] = [
  ['file-text', 'Traced to source', 'Every topic keeps its heading and page.'],
  ['graph', 'Mapped, not listed', 'Prerequisites become a graph you can edit.'],
  ['cube', 'Taught in a room', 'A 3D classroom with a live screen and boards.'],
];

export function AuthShell({ mode, children }: { mode: 'login' | 'register' | 'help'; children: ReactNode }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const signedIn = useApp((s) => !!s.session);
  // keep "where you were going" (for example buying a plan) when switching between sign in and create account
  const [carry, setCarry] = useState('');
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get('next');
    if (n && n.startsWith('/') && !n.startsWith('//')) setCarry(`?next=${encodeURIComponent(n)}`);
  }, []);
  // Guest-only pages: bounce signed-in visitors to the workspace.
  useEffect(() => {
    if (!hydrated || !signedIn || mode === 'help') return;
    const n = new URLSearchParams(window.location.search).get('next');
    router.replace(n && n.startsWith('/') && !n.startsWith('//') ? n : '/app');
  }, [hydrated, signedIn, mode, router]);

  return (
    <div className="auth">
      <aside className="auth-art" aria-label="About WorkLab XC">
        <div className="hero-bg">
          <div className="swoosh a" />
          <div className="swoosh b" />
          <div className="grain" />
        </div>
        <Link href="/" className="nav-brand">
          <LogoMark size={26} />
          <span>WorkLab XC</span>
        </Link>
        <div className="auth-copy">
          <span className="label">
            {mode === 'login' ? 'Welcome back' : mode === 'help' ? 'Your account' : 'Get started'}
          </span>
          <blockquote>
            {mode === 'login'
              ? 'Pick up where the last lesson stopped.'
              : mode === 'help'
                ? 'A few seconds, then back to your work.'
                : 'Bring one syllabus. Leave with a map.'}
          </blockquote>
          <ul className="auth-pts">
            {PTS.map((p) => (
              <li key={p[1]}>
                <span className="ic">
                  <Icon name={p[0]} size={16} />
                </span>
                <div>
                  <b>{p[1]}</b>
                  <span>{p[2]}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <Halftone
          paint={paintClassroom}
          label="Halftone classroom"
          options={{
            pitch: 6,
            animate: true,
            frameMs: 100,
            fadeX: 0.1,
            fadeBottom: 0.06,
            srcW: 480,
            srcH: 300,
          }}
        />
      </aside>
      <main className="auth-form" id="main">
        <div className="auth-top">
          <Link href="/" className="nav-brand" aria-label="WorkLab XC home">
            <LogoMark size={24} />
            <span>WorkLab XC</span>
          </Link>
          <div className="auth-top-r">
            <ThemeButton />
            {mode === 'login' ? (
              <Link href={`/register${carry}`} className="btn mono">
                Create account
              </Link>
            ) : mode === 'help' ? (
              <Link href={`/login${carry}`} className="btn mono">
                Sign in
              </Link>
            ) : (
              <Link href={`/login${carry}`} className="btn mono">
                Sign in
              </Link>
            )}
          </div>
        </div>
        <div className="auth-card">{children}</div>
        <p className="auth-legal">
          By continuing you agree to the <Link href="/terms">Terms</Link> and{' '}
          <Link href="/privacy">Privacy</Link>.
        </p>
      </main>
    </div>
  );
}
