'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { usePlay } from '@/lib/play';

export function Heart({ full }: { full: boolean }) {
  return (
    <svg className={`pl-heart${full ? ' on' : ''}`} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6 5c2 0 3.4 1 4.2 2.4h.1C11.1 6 12.5 5 14.5 5c3.3 0 5.1 3.4 3.6 6.8C16.9 16.4 12 21 12 21z" transform="translate(0 -1)" />
    </svg>
  );
}

/** Streak, level, gems and hearts in one line. It is a link to the Play page, where the league and the shop are. */
export function PlayStrip({ className = '' }: { className?: string }) {
  const { me } = usePlay();
  if (!me) return null;
  const h = me.hearts;
  return (
    <Link href="/app/leaderboard" className={`pl-strip ${className}`} aria-label={`Streak ${me.streak} days, level ${me.level}, ${me.gems} gems, ${h.unlimited ? 'unlimited' : h.n} hearts`}>
      <span className="pl-chip fire" title="Day streak">
        <Icon name="flame" size={17} /> {me.streak}
      </span>
      <span className="pl-chip xp" title="Level and points">
        <Icon name="star" size={16} /> Lv {me.level} · {me.xp}
      </span>
      <span className="pl-chip gem" title="Gems">
        <i className="pl-gem" aria-hidden="true" /> {me.gems}
      </span>
      <span className="pl-chip hearts" title="Hearts">
        <Heart full /> {h.unlimited ? '∞' : h.n}
      </span>
    </Link>
  );
}
