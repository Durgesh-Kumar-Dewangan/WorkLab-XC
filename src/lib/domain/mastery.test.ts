import { describe, expect, it } from 'vitest';
import { applyAnswer, applyConfidence, statusOf } from './mastery';

describe('mastery estimate', () => {
  it('starts from 0.6 or 0.25 on the first answer', () => {
    expect(applyAnswer(undefined, true, 1).est).toBeCloseTo(0.6);
    expect(applyAnswer(undefined, false, 1).est).toBeCloseTo(0.25);
  });

  it('moves 30% of the way toward the target afterwards', () => {
    const a = applyAnswer(undefined, true, 1);
    expect(applyAnswer(a, true, 2).est).toBeCloseTo(0.6 + 0.4 * 0.3);
    expect(applyAnswer(a, false, 2).est).toBeCloseTo(0.6 - 0.6 * 0.3);
  });

  it('tracks the wrong streak', () => {
    let m = applyAnswer(undefined, false);
    m = applyAnswer(m, false);
    expect(m.wrongStreak).toBe(2);
    expect(applyAnswer(m, true).wrongStreak).toBe(0);
  });

  it('classifies status from attempts and estimate', () => {
    expect(statusOf(undefined)).toBe('new');
    let m = applyAnswer(undefined, true);
    expect(statusOf(m)).toBe('learning');
    for (let i = 0; i < 6; i++) m = applyAnswer(m, true);
    expect(statusOf(m)).toBe('mastered');
    let w = applyAnswer(undefined, false);
    w = applyAnswer(w, false);
    expect(statusOf(w)).toBe('review');
  });

  it('confidence alone makes a topic in progress, not mastered', () => {
    const m = applyConfidence(undefined, 1);
    expect(statusOf(m)).toBe('learning');
    expect(m.est).toBeCloseTo(0.35);
  });
});
