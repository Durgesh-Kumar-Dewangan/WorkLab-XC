'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { useApp } from '@/lib/store';

/** What one marked answer earned. Sent back by the server with the answer. */
export interface Reward {
  xp?: number;
  multiplier?: number;
  combo?: number;
  gems?: number;
  goalHit?: boolean;
  streak?: number;
  hearts?: number;
  outOfHearts?: boolean;
  level?: number;
}

export interface PlayMe {
  xp: number;
  level: number;
  weekXp: number;
  streak: number;
  best: number;
  goal: { target: number; today: number; met: boolean };
  week: { day: string; xp: number }[];
  gems: number;
  hearts: { n: number; max: number; unlimited: boolean; nextAt: number | null };
  freezes: number;
  combo: number;
  alias: string;
  board: boolean;
  bonus: Record<string, number>;
}

const listeners = new Set<() => void>();
/** Tells every score display on the page to ask the server again (after an answer, a round or a purchase). */
export const refreshPlay = () => listeners.forEach((f) => f());

export function usePlay() {
  const signedIn = useApp((s) => !!s.session);
  const [me, setMe] = useState<PlayMe | null>(null);
  const load = useCallback(() => {
    if (!signedIn) return;
    api<PlayMe>('/play/me')
      .then(setMe)
      .catch(() => undefined);
  }, [signedIn]);
  useEffect(() => {
    load();
    listeners.add(load);
    return () => void listeners.delete(load);
  }, [load]);
  return { me, reload: load };
}

export const comboValue = (combo: number) => 10 * 2 ** Math.min(combo, 4);
