'use client';

import clsx from 'clsx';
import { useApp } from '@/lib/store';
import type { Settings } from '@/lib/store/types';
import { THEMES } from '@/lib/themes';

/** The look of Scenic in each light: a quiet dusk, a bright white day, a warm dawn, a grey mist. */
export const SCENIC_TONES: {
  id: NonNullable<Settings['scenicTone']>;
  name: string;
  sky: [string, string];
  far: string;
  near: string;
  ink: string;
  glass: string;
}[] = [
  {
    id: 'dusk',
    name: 'Dusk',
    sky: ['#0b1424', '#3a2b4d'],
    far: '#2a2f55',
    near: '#141a33',
    ink: '#fbf6ea',
    glass: 'rgba(14,23,42,.7)',
  },
  {
    id: 'light',
    name: 'Light white',
    sky: ['#ffffff', '#e8f0fa'],
    far: '#cfdcec',
    near: '#aebfd6',
    ink: '#14202e',
    glass: 'rgba(255,255,255,.78)',
  },
  {
    id: 'dawn',
    name: 'Dawn',
    sky: ['#ffe9d6', '#ffc9a8'],
    far: '#e9a98f',
    near: '#b5707a',
    ink: '#2b1a14',
    glass: 'rgba(255,248,240,.72)',
  },
  {
    id: 'mist',
    name: 'Mist',
    sky: ['#e3e9ef', '#c5d0db'],
    far: '#9fb0c2',
    near: '#71879c',
    ink: '#101a24',
    glass: 'rgba(244,247,250,.72)',
  },
];

/** A small drawing of the app in a theme: a top bar, a sidebar, two cards and a button, in the theme's own colours. */
export function ThemeMock({ id, tone }: { id: string; tone?: string }) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  const sc =
    id === 'scenic' ? (SCENIC_TONES.find((x) => x.id === (tone || 'dusk')) ?? SCENIC_TONES[0]) : null;
  const bg = sc ? sc.sky[0] : t.swatch[0];
  const panel = sc ? sc.glass : t.swatch[1];
  const accent = id === 'scenic' && sc?.id !== 'dusk' ? '#e07a10' : t.swatch[2];
  const ink = sc ? sc.ink : t.swatch[3];
  return (
    <div
      className="lp-mock"
      role="img"
      aria-label={`Preview of the ${t.name} theme`}
      style={{ background: sc ? `linear-gradient(180deg, ${sc.sky[0]}, ${sc.sky[1]})` : bg, color: ink }}
    >
      {sc ? (
        <svg className="lp-mt" viewBox="0 0 200 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 60V38l30-16 28 18 30-22 34 24 26-14 32 20v12z" fill={sc.far} />
          <path d="M0 60V46l40-12 34 14 38-16 40 16 48-8v20z" fill={sc.near} />
        </svg>
      ) : null}
      <span className="lp-top" style={{ background: panel }}>
        <i style={{ background: accent }} />
        <i style={{ background: ink, opacity: 0.35 }} />
        <i style={{ background: ink, opacity: 0.35 }} />
      </span>
      <span className="lp-side" style={{ background: panel }}>
        {[0, 1, 2, 3].map((k) => (
          <i key={k} style={{ background: k === 1 ? accent : ink, opacity: k === 1 ? 1 : 0.3 }} />
        ))}
      </span>
      <span className="lp-main">
        <span className="lp-card" style={{ background: panel }}>
          <b style={{ background: ink }} />
          <i style={{ background: ink, opacity: 0.35 }} />
          <i style={{ background: ink, opacity: 0.25, width: '55%' }} />
          <em style={{ background: accent }} />
        </span>
        <span className="lp-card" style={{ background: panel }}>
          <b style={{ background: ink, width: '40%' }} />
          <i style={{ background: accent, opacity: 0.5 }} />
          <i style={{ background: ink, opacity: 0.25, width: '70%' }} />
        </span>
      </span>
    </div>
  );
}

/** Scenic in four lights, so a bright white day is one tap away. */
export function ScenicTonePicker() {
  const tone = useApp((s) => s.settings.scenicTone) ?? 'dusk';
  const upd = useApp((s) => s.updateSettings);
  return (
    <div className="lp-tones" role="radiogroup" aria-label="Scenic background">
      {SCENIC_TONES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={tone === t.id}
          className={clsx('lp-tone', tone === t.id && 'on')}
          onClick={() =>
            upd((s) => {
              s.scenicTone = t.id;
            })
          }
        >
          <ThemeMock id="scenic" tone={t.id} />
          <span>{t.name}</span>
        </button>
      ))}
    </div>
  );
}

const HALLS: {
  id: 'built' | 'pavilion' | 'forest' | 'collab' | 'model' | 'three';
  name: string;
  note: string;
}[] = [
  { id: 'built', name: 'New hall', note: 'Indoor lecture hall, wood panelling' },
  { id: 'pavilion', name: 'Open-air', note: 'Pillars and a mountain view' },
  { id: 'forest', name: 'Forest deck', note: 'A wooden deck among trees' },
  { id: 'collab', name: 'Collab hall', note: 'Round tables for group work' },
  { id: 'model', name: 'Stage model', note: 'The scanned stage' },
  { id: 'three', name: 'Basic 3D', note: 'Lightest, works on any device' },
];

/** A small picture of each classroom, drawn from shapes, so the room can be chosen by how it looks. */
function HallArt({ id }: { id: string }) {
  switch (id) {
    case 'built':
      return (
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <rect width="120" height="70" fill="#2b2118" />
          <rect x="6" y="6" width="108" height="42" fill="#6b4a30" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
            <rect key={k} x={6 + k * 13.5} y="6" width="1.2" height="42" fill="#3d2a1b" />
          ))}
          <rect x="30" y="14" width="60" height="26" rx="2" fill="#0f1d44" />
          <rect x="0" y="48" width="120" height="22" fill="#4a3a2c" />
          <rect x="40" y="52" width="40" height="6" rx="2" fill="#59c8ee" />
        </svg>
      );
    case 'pavilion':
      return (
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <rect width="120" height="70" fill="#9cc7e8" />
          <path d="M0 44l24-22 22 16 26-26 28 24 20-12v50H0z" fill="#6d8fb3" />
          <rect x="14" y="14" width="6" height="40" fill="#e9e3d6" />
          <rect x="100" y="14" width="6" height="40" fill="#e9e3d6" />
          <rect x="10" y="10" width="100" height="6" fill="#d9d1c0" />
          <rect x="0" y="52" width="120" height="18" fill="#8a7a64" />
        </svg>
      );
    case 'forest':
      return (
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <rect width="120" height="70" fill="#bfe3c9" />
          {[8, 28, 76, 98].map((x) => (
            <g key={x}>
              <rect x={x} y="30" width="5" height="26" fill="#5a3d28" />
              <circle cx={x + 2.5} cy="24" r="14" fill="#3f8a54" />
            </g>
          ))}
          <rect x="0" y="52" width="120" height="18" fill="#a07a50" />
          <rect x="40" y="26" width="40" height="22" rx="2" fill="#173626" />
        </svg>
      );
    case 'collab':
      return (
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <rect width="120" height="70" fill="#e9eef5" />
          <rect x="34" y="6" width="52" height="16" rx="2" fill="#1d2f58" />
          {[28, 60, 92].map((x) => (
            <g key={x}>
              <circle cx={x} cy="46" r="11" fill="#c9d6e8" stroke="#8fa6c6" />
              {[0, 1, 2, 3, 4].map((k) => (
                <circle
                  key={k}
                  cx={x + Math.cos(k * 1.26) * 15}
                  cy={46 + Math.sin(k * 1.26) * 15}
                  r="3"
                  fill="#e9a05b"
                />
              ))}
            </g>
          ))}
        </svg>
      );
    case 'model':
      return (
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <rect width="120" height="70" fill="#1c1c24" />
          <path d="M10 52l20-26h60l20 26z" fill="#3b3b4a" />
          <rect x="38" y="30" width="44" height="14" fill="#59c8ee" opacity=".8" />
          <rect x="0" y="52" width="120" height="18" fill="#2a2a34" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <rect width="120" height="70" fill="#dfe6f1" />
          <path d="M20 54l40-30 40 30z" fill="#9db1d1" />
          <rect x="50" y="36" width="20" height="18" fill="#6f8bb5" />
        </svg>
      );
  }
}

/** The classrooms as pictures to choose from. */
export function HallPicker() {
  const S = useApp((s) => s.settings);
  const upd = useApp((s) => s.updateSettings);
  const value =
    S.engine === 'three'
      ? 'three'
      : S.hall === 'model' || S.hall === 'pavilion' || S.hall === 'forest' || S.hall === 'collab'
        ? S.hall
        : 'built';
  return (
    <div className="lp-halls" role="radiogroup" aria-label="Classroom">
      {HALLS.map((h) => (
        <button
          key={h.id}
          type="button"
          role="radio"
          aria-checked={value === h.id}
          className={clsx('lp-hall', value === h.id && 'on')}
          onClick={() =>
            upd((s) => {
              s.engine = h.id === 'three' ? 'three' : 'babylon';
              if (h.id !== 'three') s.hall = h.id;
            })
          }
        >
          <HallArt id={h.id} />
          <b>{h.name}</b>
          <small>{h.note}</small>
        </button>
      ))}
    </div>
  );
}

/** A larger live preview of the theme being looked at: the one hovered, or the one in use. */
export function ThemePreviewPanel({ id }: { id: string }) {
  const tone = useApp((s) => s.settings.scenicTone);
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  return (
    <div className="lp-panel" aria-live="polite">
      <ThemeMock id={id} tone={tone} />
      <div>
        <b>{t.name}</b>
        <small>
          {id === 'scenic' && tone && tone !== 'dusk'
            ? `Mountains in ${SCENIC_TONES.find((x) => x.id === tone)?.name.toLowerCase()} light behind frosted glass`
            : t.note}
        </small>
      </div>
    </div>
  );
}
