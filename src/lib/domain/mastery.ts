import { clamp } from '../util';
import type { Mastery, TopicStatus } from './types';

export const emptyMastery = (): Mastery => ({ att: 0, cor: 0, est: 0, last: 0, conf: null, wrongStreak: 0 });

/** An estimate from the evidence so far, never a measure of ability. */
export function applyAnswer(prev: Mastery | undefined, correct: boolean, now = Date.now()): Mastery {
  const m: Mastery = { ...emptyMastery(), ...prev };
  m.att += 1;
  if (correct) m.cor += 1;
  m.est = m.att === 1 ? (correct ? 0.6 : 0.25) : clamp(m.est + ((correct ? 1 : 0) - m.est) * 0.3, 0, 1);
  m.wrongStreak = correct ? 0 : m.wrongStreak + 1;
  m.last = now;
  return m;
}

export function applyConfidence(prev: Mastery | undefined, conf: number, now = Date.now()): Mastery {
  const m: Mastery = { ...emptyMastery(), ...prev };
  m.conf = conf;
  m.last = now;
  if (m.att === 0) m.est = Math.max(m.est, conf * 0.35);
  return m;
}

export function statusOf(m: Mastery | undefined): TopicStatus {
  if (!m || (m.att === 0 && m.conf === null)) return 'new';
  if (m.att >= 3 && m.est >= 0.8) return 'mastered';
  if (m.att >= 2 && m.est < 0.5) return 'review';
  return 'learning';
}

export const STATUS_LABEL: Record<TopicStatus, string> = {
  new: 'Not started',
  learning: 'In progress',
  review: 'Needs revision',
  mastered: 'Strong estimate',
};
export const STATUS_CHIP: Record<TopicStatus, '' | 'blue' | 'amber' | 'green'> = {
  new: '',
  learning: 'blue',
  review: 'amber',
  mastered: 'green',
};
