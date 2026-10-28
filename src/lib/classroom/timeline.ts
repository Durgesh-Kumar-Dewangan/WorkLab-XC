import { clamp } from '../util';
import type { CamName, Slide, Topic } from '../domain/types';

export type CamKey = 'board' | 'model' | 'overview';
export const CAM_KEYS: CamKey[] = ['board', 'model', 'overview'];

export const CAM_PRESETS: Record<
  CamKey,
  { pos: [number, number, number]; tgt: [number, number, number]; label: string }
> = {
  board: { pos: [0, 2.7, 4.4], tgt: [0, 2.9, -4.8], label: 'Board' },
  model: { pos: [2.6, 2.65, 1.0], tgt: [3.6, 1.55, -2.0], label: 'Model' },
  overview: { pos: [8.5, 6, 11], tgt: [0, 2.2, -2], label: 'Overview' },
};

/** Slides name a camera; the old "close" and "teacher" shots fall back to the board. */
export const camKey = (n: CamName | undefined): CamKey =>
  n === 'close' || n === 'teacher' ? 'board' : (n ?? 'board');

export interface Timeline {
  durs: number[];
  starts: number[];
  total: number;
}

/** Slide durations come from narration length (about 2.6 words a second), clamped to 5–24 s. */
export function lessonTimeline(t: Pick<Topic, 'slides'>): Timeline {
  const durs = t.slides.map((s) => clamp(s.say.split(/\s+/).length / 2.6 + 1.2, 5, 24));
  const starts: number[] = [];
  let a = 0;
  durs.forEach((d) => {
    starts.push(a);
    a += d;
  });
  return { durs, starts, total: a };
}

export const slideIndexAt = (tl: Timeline, t: number) => {
  let i = 0;
  for (let k = 0; k < tl.starts.length; k++) if (t >= tl.starts[k]) i = k;
  return i;
};
export const slideProgress = (tl: Timeline, t: number, i: number) =>
  clamp((t - tl.starts[i]) / tl.durs[i], 0, 1);

/** Bullets fade in one after another across the slide; the formula arrives last. */
export function boardReveal(s: Slide, p: number) {
  const n = s.b.length;
  return {
    reveal: s.b.map((_, i) => clamp((p - (0.08 + i * (0.7 / n))) / 0.07, 0, 1)),
    formulaAlpha: s.f ? clamp((p - 0.75) / 0.08, 0, 1) : 0,
  };
}

export const formulaText = (f: Slide['f']) => (Array.isArray(f) ? f.join('   ') : f);

export type AvState = 'idle' | 'talk' | 'point' | 'wave' | 'think';

export const POSES: Record<
  AvState,
  { shA: number[]; elA: number[]; shB: number[]; elB: number[]; neck: number[]; head: number[] }
> = {
  idle: {
    shA: [0.05, 0, 0.1],
    elA: [-0.12, 0, 0],
    shB: [0.05, 0, -0.1],
    elB: [-0.12, 0, 0],
    neck: [0, 0, 0],
    head: [0, 0, 0],
  },
  talk: {
    shA: [-0.5, 0, 0.25],
    elA: [-0.7, 0, 0],
    shB: [-0.12, 0, -0.1],
    elB: [-0.3, 0, 0],
    neck: [0, 0.12, 0],
    head: [0, 0, 0],
  },
  point: {
    shA: [-1.35, 0.1, 0.12],
    elA: [-0.15, 0, 0],
    shB: [0.05, 0, -0.1],
    elB: [-0.12, 0, 0],
    neck: [0, 0.5, 0],
    head: [-0.05, 0, 0],
  },
  wave: {
    shA: [-0.2, 0, 2.5],
    elA: [0, 0, 0.3],
    shB: [0.05, 0, -0.1],
    elB: [-0.12, 0, 0],
    neck: [0, 0.1, 0],
    head: [0, 0, 0],
  },
  think: {
    shA: [-1.0, 0, 0.1],
    elA: [-2.0, 0, 0],
    shB: [0.05, 0, -0.1],
    elB: [-0.12, 0, 0],
    neck: [0.06, 0.15, 0],
    head: [0, 0, -0.14],
  },
};
