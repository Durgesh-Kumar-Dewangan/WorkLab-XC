import type { Course, McqQuestion, Slide, Topic } from '../domain/types';
import { api } from './client';
import { startLearning, type Draft, type Prepared } from '../learn';
import { useApp } from '../store';

/** Turns the server's lesson (summary, slides, questions) into the topic shape the classroom and lesson pages read. */
export function draftToTopic(
  d: Draft,
): Pick<Topic, 'summary' | 'obj' | 'slides' | 'qs' | 'ai' | 'notes' | 'depth' | 'subject'> {
  const n = d.slides.length;
  const qs: McqQuestion[] = d.questions.map((q) => ({
    type: 'mcq',
    q: q.q,
    opts: q.options,
    ans: q.answer,
    why: q.why,
  }));
  // spread the questions over the lesson: one is put to the learner after each of these slides
  const at = new Map<number, McqQuestion>();
  let next = 1;
  qs.forEach((q, i) => {
    let idx = Math.max(next, Math.min(n - 1, 1 + Math.floor((i * (n - 1)) / qs.length)));
    while (at.has(idx) && idx < n - 1) idx++;
    if (!at.has(idx)) at.set(idx, q);
    next = idx + 1;
  });
  const slides: Slide[] = d.slides.map((s, i) => {
    const q = at.get(i);
    return {
      t: s.title,
      b: s.bullets,
      say: s.narration,
      av: 'talk',
      cam: 'board',
      ...(s.formula ? { f: s.formula } : {}),
      ...(s.example ? { ex: s.example } : {}),
      ...(q ? { check: { q: q.q, opts: q.opts, ans: q.ans, why: q.why } } : {}),
    };
  });
  return {
    summary: d.summary,
    obj: d.objectives,
    slides,
    qs,
    ai: true,
    notes: d.notes,
    depth: d.depth ?? 'standard',
    ...(d.subject ? { subject: d.subject } : {}),
  };
}

/** Asks the server to write (or fetch the saved) lesson for one topic and stores it on the topic. */
export async function writeLesson(course: Course, topicId: string): Promise<void> {
  const topic = course.topics[topicId];
  const depth = useApp.getState().settings.depth ?? 'standard';
  // a lesson written at another depth is written again; the same depth is kept
  if (!topic || (topic.ai && (topic.depth ?? 'standard') === depth)) return;
  const sessionId = await startLearning(course.id, topicId);
  const p = await api<Prepared>('/learn/prepare', {
    body: { sessionId, title: topic.title, courseTitle: course.title, depth },
  });
  useApp.getState().patchTopic(course.id, topicId, draftToTopic(p.draft));
}
