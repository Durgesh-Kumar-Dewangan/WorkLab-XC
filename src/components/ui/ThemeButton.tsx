'use client';

import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';
import { useDismiss } from '@/hooks/useDismiss';
import { useIsDark } from '@/hooks/useThemeDark';
import { useApp } from '@/lib/store';
import { THEMES } from '@/lib/themes';

/** Light or dark in one tap, and a tiny palette beside it that opens every theme so one can be chosen without going to Settings. */
export function ThemeButton() {
  const dark = useIsDark();
  const setTheme = useApp((s) => s.setTheme);
  const theme = useApp((s) => s.theme);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrap, open, close);
  return (
    <span className="qt" ref={wrap}>
      <button
        className="icon-btn bordered"
        type="button"
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        title="Switch between dark and light"
        suppressHydrationWarning
      >
        <Icon name={dark ? 'sun' : 'moon'} size={17} />
      </button>
      <button
        className="icon-btn qt-btn"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose a theme"
        aria-expanded={open}
        aria-haspopup="true"
        title="Themes"
      >
        <Icon name="palette" size={13} />
      </button>
      {open ? (
        <div className="qt-menu" role="menu" aria-label="Themes">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === t.id}
              className={clsx('qt-item', theme === t.id && 'on')}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
            >
              <span
                className="qt-sw"
                aria-hidden="true"
                style={{ background: t.swatch[0], boxShadow: `inset -7px 0 0 ${t.swatch[2]}` }}
              />
              <span>{t.name.replace('-style', '')}</span>
            </button>
          ))}
          <a className="qt-more" href="/app/settings#appearance" onClick={close}>
            All look options
          </a>
        </div>
      ) : null}
    </span>
  );
}
