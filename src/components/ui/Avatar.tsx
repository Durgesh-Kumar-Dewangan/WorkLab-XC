'use client';

import { initials } from '@/components/ui/controls';

/** The learner's picture, or their initials on their chosen colour when they have not added one. */
export function ProfilePhoto({ name, photo, color, size = 36 }: { name: string; photo?: string; color?: string; size?: number }) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
  ) : (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: '50%', background: color || 'var(--violet)', color: '#fff', display: 'inline-grid', placeItems: 'center', fontWeight: 600, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}
