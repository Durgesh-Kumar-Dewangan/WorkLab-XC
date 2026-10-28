import { describe, expect, it } from 'vitest';
import { SIM_SPECS, makeSim, simDefaults, type SimKind } from './sim';

describe('physics models', () => {
  const kinds = Object.keys(SIM_SPECS) as SimKind[];

  it.each(kinds)('%s stays finite and produces readouts', (k) => {
    const s = makeSim(k);
    for (let i = 0; i < 2400 && !s.done; i++) s.step(1 / 120);
    const [x, y] = s.pos();
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(s.readouts().length).toBeGreaterThan(0);
    s.reset();
    expect(s.t).toBe(0);
  });

  it('defaults match the spec ranges', () => {
    for (const k of kinds) {
      const d = simDefaults(k);
      for (const p of SIM_SPECS[k].params) {
        expect(d[p.k]).toBeGreaterThanOrEqual(p.min);
        expect(d[p.k]).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it('a projectile at 45° out-ranges one at 15° and 75°', () => {
    const range = (a: number) => {
      const s = makeSim('projectile', { ...simDefaults('projectile'), angle: a });
      for (let i = 0; i < 6000 && !s.done; i++) s.step(1 / 240);
      return s.pos()[0];
    };
    expect(range(45)).toBeGreaterThan(range(15));
    expect(range(45)).toBeGreaterThan(range(75));
  });
});
