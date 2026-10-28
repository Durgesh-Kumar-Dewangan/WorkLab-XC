'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { LogoMark } from '@/components/ui/Logo';
import { Halftone } from '@/components/fx/Halftone';
import { paintWordmark } from '@/lib/fx/painters';
import { useApp, useHydrated } from '@/lib/store';
import { useStart, useGoSection } from '@/hooks/useStart';
import { prefersReducedMotion } from '@/lib/util';

const wordmark = paintWordmark('WorkLab XC');

export function SiteFooter() {
  const hydrated = useHydrated();
  const signedIn = useApp((s) => !!s.session) && hydrated;
  const start = useStart();
  const go = useGoSection();
  const li = (label: string, to: string) => (
    <li>
      <Link href={to}>{label}</Link>
    </li>
  );
  const sec = (label: string, id: string) => (
    <li>
      <button type="button" onClick={() => go(id)}>
        {label}
      </button>
    </li>
  );
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="dict">
          <div className="dict-w">
            <b>work·lab</b>
            <span className="mono">/wɜːrk læb/</span>
            <i>noun</i>
          </div>
          <ol>
            <li>A room where a topic is worked through instead of read about.</li>
            <li>
              A syllabus that has been turned into a place you can walk through, with every topic traced to
              its source.
            </li>
          </ol>
        </div>
        <div className="foot-grid">
          <div>
            <Link href="/" className="nav-brand">
              <LogoMark size={24} />
              <span>WorkLab XC</span>
            </Link>
            <p className="foot-blurb">
              Upload a syllabus. Learn each topic in a live 3D room, with the source one click away.
            </p>
            <div className="foot-meta">
              <span>Made for students in India</span>
              <span>AI-written, labelled as such</span>
              <span>Delete your data any time</span>
            </div>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              {sec('How it works', 'steps')}
              {sec('Journey', 'journey')}
              {sec('Use cases', 'usecases')}
              {li('Pricing', '/pricing')}
            </ul>
          </div>
          <div>
            <h4>Try it</h4>
            <ul>
              {li(signedIn ? 'Dashboard' : 'How it works', signedIn ? '/app' : '/demo')}
              {li('Syllabus upload', signedIn ? '/app/upload' : '/demo')}
              {li('Knowledge graph', signedIn ? '/app/courses' : '/demo')}
              {li('3D classroom', signedIn ? '/app' : '/demo/classroom/n2')}
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              {li('About', '/about')}
              {li('Features', '/features')}
              {li('Contact and support', '/contact')}
              {li('Help centre', '/help')}
              {sec('FAQ', 'faq')}
            </ul>
          </div>
          <div className="foot-btns">
            <button className="btn mono solid" type="button" onClick={() => start('/app')}>
              Get started <Icon name="chev-r" size={13} />
            </button>
            <Link href="/contact" className="btn mono">
              Talk to us
            </Link>
            {signedIn ? (
              <Link href="/app" className="btn mono">
                Workspace
              </Link>
            ) : (
              <Link href="/login" className="btn mono">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
      <div className="wrap">
        <div className="foot-word">
          <Halftone
            paint={wordmark}
            label="WorkLab XC"
            options={{
              pitch: 8,
              targetCols: 130,
              gamma: 0.85,
              cut: 0.12,
              fadeX: 0.03,
              fadeTop: 0.4,
              alpha: 0.78,
              srcW: 1600,
              srcH: 330,
              scale: 1.04,
            }}
          />
        </div>
      </div>
      <div className="wrap">
        <div className="foot-copy">
          <span>© 2026 WorkLab XC</span>
          <span className="foot-legal">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refunds">Billing &amp; refunds</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/copyright">Copyright</Link>
            <Link href="/ai-use">AI use</Link>
            <button
              type="button"
              onClick={() =>
                window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
              }
            >
              Back to top
            </button>
          </span>
        </div>
      </div>
    </footer>
  );
}
