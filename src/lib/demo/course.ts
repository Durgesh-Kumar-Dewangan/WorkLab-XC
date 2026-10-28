import type { Course, Topic } from '../domain/types';
import { PHYSICS_TOPICS, PHYSICS_UNITS } from './physics-data';

/** The id the demo classroom uses. It never touches a learner's real courses. */
export const DEMO_COURSE_ID = 'demo';
/** The topic the demo opens on. */
export const DEMO_TOPIC_ID = 'n2';

let course: Course | null = null;

/** A hand-written course for the public demo: no account, no server and no AI needed. */
export function demoCourse(): Course {
  if (course) return course;
  const topics: Record<string, Topic> = {};
  PHYSICS_TOPICS.forEach((t) => (topics[t.id] = t));
  course = {
    id: DEMO_COURSE_ID,
    title: 'Physics 101: Mechanics',
    subtitle: 'Motion, forces, energy and orbits',
    source: 'upload',
    sourceName: 'Sample syllabus',
    units: PHYSICS_UNITS.map((u) => ({ ...u, topics: PHYSICS_TOPICS.filter((t) => t.u === u.id).map((t) => t.id) })),
    topics,
    order: PHYSICS_TOPICS.map((t) => t.id),
    created: 0,
  };
  return course;
}

/** The sample syllabus as plain text, the way a learner would paste it. */
export function demoSyllabusText(): string {
  const c = demoCourse();
  const lines = [`# ${c.title}`, ''];
  c.units.forEach((u) => {
    lines.push(`## ${u.title}${u.page ? ` (p. ${u.page})` : ''}`);
    u.topics.forEach((id) => lines.push(`- ${c.topics[id].title}${c.topics[id].page ? ` (p. ${c.topics[id].page})` : ''}`));
    lines.push('');
  });
  return lines.join('\n').trim();
}
