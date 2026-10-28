'use client';

import { useApp } from '@/lib/store';
import type { LessonDepth } from '@/lib/store/types';

export const DEPTHS: { id: LessonDepth; name: string; note: string }[] = [
  { id: 'quick', name: 'Quick', note: 'A short overview: 3 to 5 slides' },
  { id: 'standard', name: 'Standard', note: 'The usual lesson: 5 to 8 slides' },
  { id: 'deep', name: 'Deep', note: 'Worked examples and the reasoning: 8 to 10 slides' },
];

/** How deep each new lesson goes. Every topic is written on its own at this depth; a topic saved at another depth is written again when opened. */
export function DepthPicker({ compact = false }: { compact?: boolean }) {
  const value = useApp((s) => s.settings.depth) ?? 'standard';
  const upd = useApp((s) => s.updateSettings);
  const set = (v: LessonDepth) =>
    upd((s) => {
      s.depth = v;
    });
  if (compact)
    return (
      <label className="ps-compact">
        <span>Lesson depth</span>
        <select className="select" value={value} onChange={(e) => set(e.target.value as LessonDepth)} aria-label="Lesson depth">
          {DEPTHS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <div className="dp-grid" role="radiogroup" aria-label="Lesson depth">
      {DEPTHS.map((d) => (
        <button key={d.id} type="button" role="radio" aria-checked={value === d.id} className={`ps-card${value === d.id ? ' on' : ''}`} onClick={() => set(d.id)}>
          <span className="tp-name">{d.name}</span>
          <span className="tp-note">{d.note}</span>
        </button>
      ))}
    </div>
  );
}
