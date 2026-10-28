import { describe, expect, it } from 'vitest';
import type { Course, Topic } from './types';
import { layoutGraph, wouldCycle } from './graph';

const d = { graphEdits: {} } as Parameters<typeof wouldCycle>[0];

/** A small course with a chain of prerequisites across two units. */
function fixture(): Course {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const topics: Record<string, Topic> = {};
  ids.forEach((id, i) => {
    topics[id] = {
      id,
      u: i < 3 ? 'u1' : 'u2',
      page: null,
      title: `Topic ${id}`,
      mins: 10,
      demo: 'concept',
      req: i ? [ids[i - 1]] : [],
      summary: '',
      obj: [],
      slides: [],
      qs: [],
    };
  });
  return {
    id: 'fixture',
    title: 'Fixture',
    subtitle: '',
    source: 'upload',
    sourceName: 'fixture',
    units: [
      { id: 'u1', title: 'One', page: null, topics: ['a', 'b', 'c'] },
      { id: 'u2', title: 'Two', page: null, topics: ['d', 'e', 'f'] },
    ],
    topics,
    order: ids,
    created: 0,
  };
}

describe('knowledge graph', () => {
  const c = fixture();

  it('lays out every topic exactly once in both views', () => {
    for (const view of ['layered', 'unit'] as const) {
      const l = layoutGraph(d, c, view, new Set());
      expect(Object.keys(l.pos).sort()).toEqual(Object.keys(c.topics).sort());
      expect(l.W).toBeGreaterThan(0);
      expect(l.H).toBeGreaterThan(0);
    }
  });

  it('refuses edges that would close a cycle', () => {
    const l = layoutGraph(d, c, 'layered', new Set());
    const e = l.edges.find((x) => x.type === 'req') ?? l.edges[0];
    expect(e).toBeDefined();
    expect(wouldCycle(d, c, e.to, e.from)).toBe(true);
    expect(wouldCycle(d, c, e.from, e.from)).toBe(true);
  });
});
