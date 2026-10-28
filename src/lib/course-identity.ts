import type { Course } from './domain/types';
import { subjectOf, type SubjectLook } from './classroom/subject';

/** Names a course the way a learner would: from the syllabus itself, not from a file name or a half-cut heading. */

const SMALL = new Set([
  'and',
  'or',
  'of',
  'the',
  'in',
  'on',
  'to',
  'for',
  'a',
  'an',
  'with',
  'by',
  'at',
  'vs',
]);
const PREFIX =
  /^(unit|chapter|module|week|lesson|part|topic|section|semester|sem|course)\s*[-_:.]?\s*(\d+|[ivxl]+)\b[\s:.\-–—_]*/i;

const words = (s: string) => s.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

function titleCase(s: string): string {
  return words(s)
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function shouting(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, '');
  return letters.length >= 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7;
}

/** Strips a "Unit 3:" lead-in and tidies the case. */
function clean(s: string): string {
  let t = words(s.replace(/\.[a-z0-9]{2,4}$/i, ''));
  t = t.replace(PREFIX, '').trim();
  return shouting(t) ? titleCase(t) : t;
}

function isPoor(t: string): boolean {
  const s = t.trim();
  if (!s || /^untitled/i.test(s) || /^(my )?(course|syllabus|notes?)$/i.test(s)) return true;
  if (PREFIX.test(s)) return true;
  if (shouting(s)) return true;
  if (/\s[A-Za-z]$/.test(s) && !/\s(A|I)$/.test(s)) return true; // cut off in the middle of a word
  return s.length > 64;
}

type Shape = Pick<Course, 'title' | 'units' | 'topics' | 'order'>;

function headings(c: Shape): string[] {
  return [
    ...c.units.map((u) => u.title),
    ...c.order.slice(0, 12).map((id) => c.topics[id]?.title ?? ''),
  ].filter(Boolean);
}

/** What the course is about, from its title and the headings inside it. */
export function courseSubject(c: Shape): SubjectLook {
  return subjectOf([c.title, ...headings(c)]);
}

/** A readable subject name. Good names are left alone. */
export function smartTitle(c: Shape): string {
  const given = c.title.trim();
  if (!isPoor(given)) return given;
  const heads = headings(c);
  let t = clean(given);
  if (t && !/^untitled/i.test(t)) {
    // "Decision M" was cut off: find the full heading it came from
    const low = t.toLowerCase();
    const whole = heads.map(clean).find((h) => h.toLowerCase().startsWith(low) && h.length > t.length);
    if (whole) t = whole;
    else if (/\s[A-Za-z]$/.test(t)) t = t.replace(/\s[A-Za-z]$/, '');
    return t.length > 64 ? `${t.slice(0, 61).replace(/\s+\S*$/, '')}…` : t;
  }
  // no name at all: the subject, or the first headings
  const look = courseSubject(c);
  const units = c.units.map((u) => clean(u.title)).filter(Boolean);
  if (look.id !== 'general')
    return units.length && units.length <= 2 ? `${look.label}: ${units.join(' & ')}` : look.label;
  if (units.length) return units.length === 1 ? units[0] : `${units[0]} & ${units[1]}`;
  return 'My course';
}

/** The course as the app should show it: a proper name, and the subject worked out. */
export function tidyCourse(c: Course): Course {
  const title = smartTitle(c);
  return title === c.title ? c : { ...c, title };
}
