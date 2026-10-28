'use client';

import { useApp } from '@/lib/store';
import { PATH_STYLES } from '@/lib/pathStyles';
import type { PathStyle } from '@/lib/store/types';

/** Six game looks for the learning path. `compact` is a small drop-down for the Learn page; the full one is a gallery for Settings. */
export function PathStylePicker({ compact = false }: { compact?: boolean }) {
  const value = useApp((s) => s.settings.pathStyle) ?? 'classic';
  const upd = useApp((s) => s.updateSettings);
  const set = (v: PathStyle) =>
    upd((s) => {
      s.pathStyle = v;
    });
  if (compact)
    return (
      <label className="ps-compact">
        <span>Path style</span>
        <select className="select" value={value} onChange={(e) => set(e.target.value as PathStyle)} aria-label="Learning path style">
          {PATH_STYLES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <div className="ps-grid" role="radiogroup" aria-label="Learning path style">
      {PATH_STYLES.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className={`ps-card${value === p.id ? ' on' : ''}`} onClick={() => set(p.id)}>
          <span className={`ps-prev lp`} data-path={p.id} aria-hidden="true">
            <i className="lp-node done" />
            <i className="lp-node current" />
            <i className="lp-node locked" />
          </span>
          <span className="tp-name">{p.name}</span>
          <span className="tp-note">{p.note}</span>
        </button>
      ))}
    </div>
  );
}
