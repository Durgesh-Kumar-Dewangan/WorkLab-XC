import { emptyMastery, statusOf } from './mastery';
import type { Course, Edge, GraphEdits, Mastery, Recommendation, TopicStatus } from './types';

/** The slice of persisted state the course logic needs. Keeps domain code free of any store dependency. */
export interface LearnerData {
  mastery: Record<string, Mastery>;
  graphEdits: Record<string, GraphEdits>;
  courses: Course[];
}

export const emptyEdits = (): GraphEdits => ({
  accepted: [],
  rejected: [],
  renamed: {},
  added: [],
  removed: [],
});

export function allCourses(d: Pick<LearnerData, 'courses'>): Course[] {
  return d.courses ?? [];
}
export const getCourse = (d: Pick<LearnerData, 'courses'>, id: string) =>
  allCourses(d).find((c) => c.id === id) ?? null;

export function findTopic(d: Pick<LearnerData, 'courses'>, tid: string) {
  for (const c of allCourses(d)) if (c.topics[tid]) return { course: c, topic: c.topics[tid] };
  return null;
}

export const edgeKey = (a: string, b: string) => `${a}>${b}`;

export function topicTitle(d: Pick<LearnerData, 'graphEdits'>, c: Course, id: string): string {
  return d.graphEdits[c.id]?.renamed?.[id] || c.topics[id]?.title || id;
}

export function courseEdges(d: Pick<LearnerData, 'graphEdits'>, c: Course): Edge[] {
  const e = d.graphEdits[c.id] ?? emptyEdits();
  const out: Edge[] = [];
  for (const id of c.order) {
    const t = c.topics[id];
    for (const p of t.req ?? []) {
      if (!c.topics[p]) continue;
      const k = edgeKey(p, id);
      out.push({
        from: p,
        to: id,
        type: 'req',
        status: e.removed.includes(k) ? 'rejected' : 'confirmed',
        key: k,
      });
    }
    for (const p of t.inf ?? []) {
      if (!c.topics[p]) continue;
      const k = edgeKey(p, id);
      out.push({
        from: p,
        to: id,
        type: 'inf',
        status: e.rejected.includes(k) ? 'rejected' : e.accepted.includes(k) ? 'accepted' : 'inferred',
        key: k,
      });
    }
    for (const [p, kind] of t.rel ?? []) {
      if (c.topics[p])
        out.push({ from: p, to: id, type: 'rel', status: 'confirmed', key: `${edgeKey(p, id)}:rel`, kind });
    }
  }
  for (const [a, b] of e.added) {
    if (c.topics[a] && c.topics[b])
      out.push({ from: a, to: b, type: 'manual', status: 'confirmed', key: edgeKey(a, b) });
  }
  return out;
}

export const edgeActive = (ed: Edge) =>
  ed.type !== 'rel' && (ed.status === 'confirmed' || ed.status === 'accepted');

export const prereqs = (d: LearnerData, c: Course, id: string) =>
  courseEdges(d, c)
    .filter((e) => e.to === id && edgeActive(e))
    .map((e) => e.from);
export const dependents = (d: LearnerData, c: Course, id: string) =>
  courseEdges(d, c)
    .filter((e) => e.from === id && edgeActive(e))
    .map((e) => e.to);

export const masteryOf = (d: Pick<LearnerData, 'mastery'>, tid: string): Mastery =>
  d.mastery[tid] ?? emptyMastery();
export const statusFor = (d: Pick<LearnerData, 'mastery'>, tid: string): TopicStatus =>
  statusOf(d.mastery[tid]);

export function courseMastery(d: Pick<LearnerData, 'mastery'>, c: Course): number {
  if (!c.order.length) return 0;
  return c.order.reduce((s, id) => s + (masteryOf(d, id).est || 0), 0) / c.order.length;
}

export function courseCounts(d: Pick<LearnerData, 'mastery'>, c: Course): Record<TopicStatus, number> {
  const n: Record<TopicStatus, number> = { new: 0, learning: 0, review: 0, mastered: 0 };
  c.order.forEach((id) => n[statusFor(d, id)]++);
  return n;
}

export const weakPrereqs = (d: LearnerData, c: Course, id: string) =>
  prereqs(d, c, id).filter((p) => (masteryOf(d, p).est || 0) < 0.5);
export const topicReady = (d: LearnerData, c: Course, id: string) =>
  prereqs(d, c, id).every((p) => (masteryOf(d, p).est || 0) >= 0.5);

/** Transparent rules, shown to the learner together with the reason. */
export function recommend(d: LearnerData, c: Course | null): Recommendation | null {
  if (!c) return null;
  const rows = c.order.map((id) => ({
    id,
    st: statusFor(d, id),
    est: masteryOf(d, id).est || 0,
    att: masteryOf(d, id).att || 0,
  }));
  const review = rows.filter((r) => r.st === 'review').sort((a, b) => a.est - b.est)[0];
  if (review) {
    const wp = weakPrereqs(d, c, review.id);
    if (wp.length) {
      const w = [...wp].sort((a, b) => masteryOf(d, a).est - masteryOf(d, b).est)[0];
      return {
        id: w,
        kind: 'prereq',
        reason: `Your estimate for “${topicTitle(d, c, review.id)}” is ${Math.round(review.est * 100)}% and it builds on “${topicTitle(d, c, w)}” (${Math.round(masteryOf(d, w).est * 100)}%). Strengthening that first usually helps.`,
      };
    }
    return {
      id: review.id,
      kind: 'review',
      reason: `Your estimate for this topic is ${Math.round(review.est * 100)}% after ${review.att} attempts. A short revision pass is the next best step.`,
    };
  }
  const next = rows.find((r) => r.st === 'new' && topicReady(d, c, r.id));
  if (next)
    return {
      id: next.id,
      kind: 'next',
      reason: 'You have covered what this topic builds on, and you have not started it yet.',
    };
  const low = rows.filter((r) => r.st === 'learning').sort((a, b) => a.est - b.est)[0];
  if (low) {
    return {
      id: low.id,
      kind: 'continue',
      reason: `This topic is in progress, and it has the lowest estimate (${Math.round(low.est * 100)}%) among your active topics.`,
    };
  }
  const any = [...rows].sort((a, b) => a.est - b.est)[0];
  return any
    ? { id: any.id, kind: 'refresh', reason: 'Everything is strong. A spaced refresher keeps it that way.' }
    : null;
}

export const nextTopicAfter = (c: Course, id: string) => {
  const i = c.order.indexOf(id);
  return i >= 0 && i < c.order.length - 1 ? c.order[i + 1] : null;
};
export const prevTopicBefore = (c: Course, id: string) => {
  const i = c.order.indexOf(id);
  return i > 0 ? c.order[i - 1] : null;
};
