'use client';

import { useState } from 'react';
import { ScenicTonePicker, ThemePreviewPanel } from '@/components/app/LookPreviews';
import { useApp } from '@/lib/store';
import { ACCENTS, THEMES } from '@/lib/themes';
import { Segmented } from '@/components/ui/controls';
import type { CustomLook } from '@/lib/store/types';

const BASE: CustomLook = { accent: '', radius: 'default', font: 'default', density: 'default' };

/** A card for every theme, with a small preview of its colours. */
export function ThemePicker() {
  const theme = useApp((s) => s.theme) || 'system';
  const setTheme = useApp((s) => s.setTheme);
  const groups = Array.from(new Set(THEMES.map((t) => t.group)));
  const [peek, setPeek] = useState('');
  const shown = peek || (theme === 'system' ? 'light' : theme);
  return (
    <div className="tp-groups" role="radiogroup" aria-label="Theme">
      <ThemePreviewPanel id={shown} />
      {groups.map((g) => (
        <div key={g}>
          <h3 className="tp-gh">{g}</h3>
          <div className="tp-grid">
            {THEMES.filter((t) => t.group === g).map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={theme === t.id}
                className={`tp-card${theme === t.id ? ' on' : ''}`}
                onClick={() => setTheme(t.id)}
                onMouseEnter={() => setPeek(t.id)}
                onMouseLeave={() => setPeek('')}
                onFocus={() => setPeek(t.id)}
                onBlur={() => setPeek('')}
              >
                <span className="tp-prev" aria-hidden="true" style={{ background: t.swatch[0] }}>
                  <i style={{ background: t.swatch[1] }} />
                  <b style={{ background: t.swatch[2] }} />
                  <em style={{ background: t.swatch[3] }} />
                </span>
                <span className="tp-name">{t.name}</span>
                <span className="tp-note">{t.note}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <h3 className="tp-gh">Scenic background</h3>
        <ScenicTonePicker />
      </div>
    </div>
  );
}

/** Accent colour, corners, letters and spacing on top of the chosen theme. */
export function CustomLookControls() {
  const custom = useApp((s) => s.settings.custom);
  const upd = useApp((s) => s.updateSettings);
  const set = (fn: (c: CustomLook) => void) =>
    upd((s) => {
      s.custom = { ...BASE, ...s.custom };
      fn(s.custom);
    });
  const c = { ...BASE, ...custom };
  const changed = c.accent || c.radius !== 'default' || c.font !== 'default' || c.density !== 'default';
  return (
    <div className="tp-custom">
      <div className="tp-row">
        <span>Accent colour</span>
        <span className="tp-swatches">
          <button
            type="button"
            className={`tp-sw none${!c.accent ? ' on' : ''}`}
            aria-label="The theme's own colour"
            title="The theme's own colour"
            onClick={() => set((k) => void (k.accent = ''))}
          >
            Auto
          </button>
          {ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              className={`tp-sw${c.accent.toLowerCase() === a ? ' on' : ''}`}
              style={{ background: a }}
              aria-label={`Accent ${a}`}
              onClick={() => set((k) => void (k.accent = a))}
            />
          ))}
          <label className="tp-sw pick" title="Choose any colour">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent : '#2f7bff'}
              onChange={(e) => set((k) => void (k.accent = e.target.value))}
              aria-label="Pick a custom accent colour"
            />
          </label>
        </span>
      </div>
      <div className="tp-row">
        <span>Corners</span>
        <Segmented<CustomLook['radius']>
          ariaLabel="Corners"
          value={c.radius}
          onChange={(v) => set((k) => void (k.radius = v))}
          options={[
            { value: 'sharp', label: 'Sharp' },
            { value: 'default', label: 'Default' },
            { value: 'round', label: 'Round' },
          ]}
        />
      </div>
      <div className="tp-row">
        <span>Letters</span>
        <Segmented<CustomLook['font']>
          ariaLabel="Letters"
          value={c.font}
          onChange={(v) => set((k) => void (k.font = v))}
          options={[
            { value: 'default', label: 'Sans' },
            { value: 'serif', label: 'Serif' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'mono', label: 'Mono' },
          ]}
        />
      </div>
      <div className="tp-row">
        <span>Spacing</span>
        <Segmented<CustomLook['density']>
          ariaLabel="Spacing"
          value={c.density}
          onChange={(v) => set((k) => void (k.density = v))}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'default', label: 'Default' },
            { value: 'roomy', label: 'Roomy' },
          ]}
        />
      </div>
      {changed ? (
        <button
          type="button"
          className="btn xs"
          onClick={() =>
            set((k) =>
              Object.assign(k, { accent: '', radius: 'default', font: 'default', density: 'default' }),
            )
          }
        >
          Reset my changes
        </button>
      ) : null}
    </div>
  );
}
