'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';
import { useToasts } from '@/lib/ui/toast';
import { closeModal, useModals, type ModalEntry } from '@/lib/ui/modal';

export function ToastHost() {
  const items = useToasts();
  return (
    <div id="toasts" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx('toast', t.kind)}
          role="status"
          style={t.leaving ? { transition: 'opacity .25s', opacity: 0 } : undefined}
        >
          <Icon name={t.kind === 'err' ? 'alert' : t.kind === 'ok' ? 'check' : 'info'} size={18} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

const FOCUSABLE = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

function ModalView({ m, top }: { m: ModalEntry; top: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current;
      const f =
        el?.querySelector<HTMLElement>('input,select,textarea,button.solid,button.blue') ??
        el?.querySelector<HTMLElement>('button');
      f?.focus();
    }, 30);
    return () => {
      clearTimeout(t);
      try {
        prev?.focus?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeModal(m.id);
      }
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (x) => !(x as HTMLButtonElement).disabled && x.offsetParent !== null,
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [top, m.id]);

  return (
    <div
      ref={scrimRef}
      className={clsx('scrim', m.cls)}
      onMouseDown={(e) => {
        if (e.target === scrimRef.current) closeModal(m.id);
      }}
    >
      <div
        ref={ref}
        className={clsx('modal', m.wide && 'wide')}
        role="dialog"
        aria-modal="true"
        aria-label={m.title || 'Dialog'}
      >
        {m.title ? <h2>{m.title}</h2> : null}
        {typeof m.body === 'string' ? <p className="body">{m.body}</p> : m.body}
        {m.actions?.length ? (
          <div className="actions">
            {m.actions.map((a, i) => (
              <button
                key={i}
                type="button"
                className={clsx('btn', a.kind)}
                onClick={async () => {
                  const r = a.onClick ? await a.onClick() : undefined;
                  if (a.closes !== false && r !== false) closeModal(m.id, a.value);
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ModalHost() {
  const stack = useModals();
  return (
    <>
      {stack.map((m, i) => (
        <ModalView key={m.id} m={m} top={i === stack.length - 1} />
      ))}
    </>
  );
}
