'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { api, hasBackend } from '@/lib/api/client';
import { useAddons } from '@/hooks/useAddons';
import { useServerMe } from '@/hooks/useServerMe';
import { useServerSync } from '@/lib/api/sync';
import { usePresence } from '@/hooks/usePresence';
import { Icon } from '@/components/ui/Icon';
import { LogoMark } from '@/components/ui/Logo';
import { ThemeButton } from '@/components/ui/ThemeButton';
import { PlanNudge } from '@/components/app/PlanNudge';
import { UsernameBanner } from '@/components/app/UsernameBanner';
import { ProfilePhoto } from '@/components/ui/Avatar';
import { NAV, crumbsFor } from './nav';
import { streakDays } from '@/lib/domain/stats';
import { SearchDialog } from './SearchDialog';
import { getCourse, topicTitle } from '@/lib/domain/courses';
import { getApp, useApp, useHydrated } from '@/lib/store';
import { openModal } from '@/lib/ui/modal';
import { toast } from '@/lib/ui/toast';
import { useDismiss } from '@/hooks/useDismiss';
import { ago } from '@/lib/util';

export function openSearch(go: (to: string) => void) {
  const m = openModal({
    body: (
      <SearchDialog
        onPick={(to) => {
          m.close();
          go(to);
        }}
      />
    ),
    cls: 'search',
  });
}

function NotifMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const items = useApp((s) => s.notifications);
  const markRead = useApp((s) => s.markRead);
  const unread = items.filter((n) => !n.read).length;
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrap, open, close);

  return (
    <div className="bellwrap" ref={wrap}>
      <button
        className="icon-btn bordered"
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={17} />
      </button>
      <span className="cnt" hidden={!unread}>
        {unread}
      </span>
      {open ? (
        <div
          className="menu"
          role="dialog"
          aria-label="Notifications"
          style={{ right: 0, top: 'calc(100% + 6px)', width: 'min(360px,calc(100vw - 16px))', padding: 8 }}
        >
          <div className="row" style={{ padding: '6px 8px 10px', justifyContent: 'space-between' }}>
            <span className="label">Notifications</span>
            <button
              className="btn xs ghost"
              type="button"
              onClick={() => {
                markRead();
                close();
              }}
            >
              Mark all read
            </button>
          </div>
          {items.length ? (
            items.slice(0, 5).map((n) => (
              <button
                key={n.id}
                type="button"
                style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 2 }}
                onClick={() => {
                  markRead(n.id);
                  close();
                  router.push(n.link || '/app/notifications');
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: n.read ? 400 : 600 }}>
                  {(n.read ? '' : '● ') + n.title}
                </span>
                <span className="small" style={{ fontSize: 12 }}>
                  {ago(n.ts)}
                </span>
              </button>
            ))
          ) : (
            <div className="small" style={{ padding: '12px 8px' }}>
              Nothing yet. Reminders and progress notes appear here.
            </div>
          )}
          <hr />
          <button
            type="button"
            onClick={() => {
              close();
              router.push('/app/notifications');
            }}
          >
            See all notifications
          </button>
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ name, color }: { name: string; color: string }) {
  const photo = useApp((st) => st.profile.photo);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const signOut = useApp((s) => s.signOut);
  const isAdmin = !!useServerMe().me?.user.admin;
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrap, open, close);
  const item = (label: string, ic: string, href: string) => (
    <Link href={href} role="menuitem" onClick={close}>
      <Icon name={ic} size={16} />
      <span>{label}</span>
    </Link>
  );
  return (
    <div style={{ position: 'relative' }} ref={wrap}>
      <button
        className="icon-btn"
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        style={{ padding: 0, border: 0, overflow: 'hidden' }}
        onClick={() => setOpen((o) => !o)}
      >
        <ProfilePhoto name={name} photo={photo} color={color} size={36} />
      </button>
      {open ? (
        <div className="menu" role="menu" style={{ right: 0, top: 'calc(100% + 6px)' }}>
          {item('Profile', 'user', '/app/profile')}
          {item('Settings', 'settings', '/app/settings')}
          {item('Notifications', 'bell', '/app/notifications')}
          {item('Support', 'help', '/app/support')}
          {item('Feedback', 'msg', '/app/feedback')}
          {isAdmin ? item('Admin', 'shield', '/app/admin') : null}
          <hr />
          {item('Back to the website', 'home', '/?site=1')}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close();
              if (hasBackend()) void api('/auth/logout', { body: {} }).catch(() => undefined);
              signOut();
              toast('Signed out.', 'ok');
              router.push('/');
            }}
          >
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * The account card at the bottom of the sidebar: photo, name and a chevron. It opens a menu upward with Profile, Settings,
 * Support, Download app (installs WorkLab XC as an app where the browser allows it) and Sign out.
 */
/** Day streak and study points (one per minute studied), as in the sidebar of a learning app. */
function SideStats() {
  const minutes = useApp((s) => s.minutes);
  const streak = streakDays(minutes);
  const xp = Math.round(Object.values(minutes as Record<string, number>).reduce((a, b) => a + b, 0));
  return (
    <div className="side-stats" aria-label="Your streak and points">
      <span title="Days in a row you studied">
        <Icon name="flame" size={17} /> {streak}
      </span>
      <span title="Study points: one for every minute you study">
        <Icon name="star" size={17} /> {xp}
      </span>
    </div>
  );
}

/** A soft pill for Free learners, linking to the plans. Hidden once the learner is on a paid plan. */
function UpgradePill() {
  const { me } = useServerMe();
  if (!me || me.user.plan !== 'prototype') return null;
  return (
    <Link href="/pricing" className="side-upgrade">
      <Icon name="sparkles" size={18} />
      <span>
        <b>Upgrade</b>
        <small>Learn without limits</small>
      </span>
    </Link>
  );
}

function AccountCard({ name, email, color }: { name: string; email: string; color: string }) {
  const photo = useApp((st) => st.profile.photo);
  const signOut = useApp((s) => s.signOut);
  const router = useRouter();
  const isAdmin = !!useServerMe().me?.user.admin;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const install = useRef<InstallEvent | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrap, open, close);
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      install.current = e as InstallEvent;
    };
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  const go = (label: string, ic: string, href: string) => (
    <Link href={href} role="menuitem" className="acct-item" onClick={close}>
      <Icon name={ic} size={18} />
      <span>{label}</span>
    </Link>
  );
  const downloadApp = async () => {
    close();
    if (install.current) {
      await install.current.prompt().catch(() => undefined);
      install.current = null;
    } else {
      toast('Open your browser menu and choose “Install app” or “Add to Home screen”.');
    }
  };
  return (
    <div className="acct" ref={wrap}>
      {open ? (
        <div className="acct-menu" role="menu" aria-label="Account">
          {go('Profile', 'user', '/app/profile')}
          {go('Settings', 'settings', '/app/settings')}
          {go('Help centre', 'info', '/help')}
          {go('Support', 'help', '/app/support')}
          {isAdmin ? go('Admin', 'shield', '/app/admin') : null}
          <button type="button" role="menuitem" className="acct-item" onClick={() => void downloadApp()}>
            <Icon name="box" size={18} />
            <span>Download app</span>
          </button>
          <hr />
          <button
            type="button"
            role="menuitem"
            className="acct-item danger"
            onClick={() => {
              close();
              if (hasBackend()) void api('/auth/logout', { body: {} }).catch(() => undefined);
              signOut();
              toast('Signed out.', 'ok');
              router.push('/');
            }}
          >
            <Icon name="logout" size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="acct-card"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={email}
      >
        <ProfilePhoto name={name} photo={photo} color={color} size={38} />
        <span className="acct-name">{name}</span>
        <Icon name={open ? 'chev-d' : 'chev-u'} size={16} />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const session = useApp((s) => s.session);
  const color = useApp((s) => s.profile.color);
  const pname = useApp((s) => s.profile.name);
  const [open, setOpen] = useState(false);
  const addons = useAddons();
  const first = useRef<HTMLAnchorElement>(null);

  // Auth gate: wait for hydration, then bounce signed-out visitors to the sign-in page.
  useEffect(() => {
    if (hydrated && !session) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [hydrated, session, path, router]);

  useEffect(() => setOpen(false), [path]);

  // "/" opens search anywhere in the workspace.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !/^(input|textarea|select)$/i.test(t?.tagName ?? '') && !t?.isContentEditable) {
        e.preventDefault();
        openSearch((to) => router.push(to));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [router]);

  const sync = useServerSync();
  usePresence();
  const meUser = useServerMe().me?.user;
  const isAdmin = !!meUser?.admin;
  const isDev = isAdmin || !!meUser?.dev;
  if (!hydrated || !session || sync.status === 'idle' || sync.status === 'loading') {
    return <div className="app" aria-busy="true" />;
  }
  if (sync.status === 'error') {
    return (
      <div className="app" role="alert" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="empty">
          <Icon name="alert" size={24} />
          <h2 className="h3">We could not load your workspace</h2>
          <p className="body">{sync.error}</p>
          <button className="btn solid" type="button" onClick={sync.retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const crumbs = crumbsFor(path, {
    course: (cid) => getCourse(getApp(), cid)?.title ?? null,
    topic: (cid, tid) => {
      const d = getApp();
      const c = getCourse(d, cid);
      return c && c.topics[tid] ? topicTitle(d, c, tid) : null;
    },
  });
  const s = session;
  const nl = ([label, to, ic, test]: (typeof NAV)[number]) => (
    <Link
      key={to}
      href={to}
      className="nl"
      aria-current={test(path) ? 'page' : undefined}
      onClick={() => setOpen(false)}
    >
      <Icon name={ic} size={18} />
      <span>{label}</span>
      {to === '/app/tutor' && addons.loaded && !addons.chatbot && addons.freeChatLeft === 0 ? (
        <em className="navtag">Add-on</em>
      ) : null}
    </Link>
  );

  return (
    <div className="app">
      <aside className={clsx('side', open && 'open')} id="sidebar" aria-label="Primary">
        <Link href="/" className="nav-brand" aria-label="WorkLab XC home" ref={first}>
          <LogoMark size={24} />
          <span>WorkLab XC</span>
        </Link>
        <div className="grp">Learn</div>
        {NAV.map(nl)}
        <div className="sp" />
        <SideStats />
        <UpgradePill />
        <AccountCard name={s.name || pname} email={s.email} color={color || 'var(--violet)'} />
      </aside>
      <div className={clsx('scrimside', open && 'show')} onClick={() => setOpen(false)} />
      <main id="main" className="app-main">
        <header className="topbar">
          <button
            className="icon-btn bordered mob-only"
            type="button"
            aria-label="Open navigation"
            aria-controls="sidebar"
            onClick={() => {
              setOpen(true);
              setTimeout(() => first.current?.focus(), 0);
            }}
          >
            <Icon name="menu" size={18} />
          </button>
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: 'contents' }}>
                {i ? (
                  <span aria-hidden="true" className="hide-m">
                    /
                  </span>
                ) : null}
                {i === crumbs.length - 1 ? (
                  <b>{c[0]}</b>
                ) : c[1] ? (
                  <Link href={c[1]} className="hide-m">
                    {c[0]}
                  </Link>
                ) : (
                  <span className="hide-m">{c[0]}</span>
                )}
              </span>
            ))}
          </div>
          <div className="grow" />
          <button
            className="searchbtn"
            type="button"
            aria-label="Search courses and topics"
            onClick={() => openSearch((to) => router.push(to))}
          >
            <Icon name="search" size={16} />
            <span>Search</span>
            <span className="kbd">/</span>
          </button>
          <ThemeButton />
          <NotifMenu />
          <UserMenu name={s.name || pname} color={color || 'var(--violet)'} />
          {isDev ? (
            <Link
              href="/app/admin/dev"
              className="icon-btn bordered lm-icon"
              aria-label="Developer console"
              title="Developer console"
            >
              <Icon name="bug" size={15} />
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              href="/app/admin/live"
              className="icon-btn bordered lm-icon"
              aria-label="Live map"
              title="Live map"
            >
              <Icon name="globe" size={15} />
            </Link>
          ) : null}
        </header>
        <UsernameBanner />
        <PlanNudge />
        {children}
      </main>
    </div>
  );
}
