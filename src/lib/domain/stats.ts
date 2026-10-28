import { dayKey } from '../util';

export interface DayMinutes {
  key: string;
  d: Date;
  min: number;
}

export function lastDays(minutes: Record<string, number>, n: number, now = Date.now()): DayMinutes[] {
  const out: DayMinutes[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = dayKey(d);
    out.push({ key, d, min: minutes[key] || 0 });
  }
  return out;
}

/** Consecutive days with study time, ending today (today may still be empty). */
export function streakDays(minutes: Record<string, number>, now = Date.now()): number {
  let s = 0;
  for (let i = 0; i < 400; i++) {
    const k = dayKey(new Date(now - i * 86400000));
    if ((minutes[k] || 0) > 0) s++;
    else if (i === 0) continue;
    else break;
  }
  return s;
}

export const weekMinutes = (minutes: Record<string, number>) =>
  Math.round(lastDays(minutes, 7).reduce((s, d) => s + d.min, 0));
