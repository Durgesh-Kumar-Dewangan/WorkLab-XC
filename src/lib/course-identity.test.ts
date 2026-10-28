import { describe, expect, it } from 'vitest';
import type { Course } from './domain/types';
import { courseSubject, smartTitle } from './course-identity';

const course = (title: string, units: string[], topics: string[] = units): Pick<Course, 'title' | 'units' | 'topics' | 'order'> => {
  const t: Course['topics'] = {};
  topics.forEach((x, i) => (t[`t${i}`] = { id: `t${i}`, title: x } as Course['topics'][string]));
  return { title, units: units.map((u, i) => ({ id: `u${i}`, title: u, page: null, topics: [] })) as Course['units'], topics: t, order: Object.keys(t) };
};

describe('naming a course from its syllabus', () => {
  it('leaves a good name alone', () => {
    expect(smartTitle(course('Physics 101', ['Motion']))).toBe('Physics 101');
    expect(smartTitle(course('Organic Chemistry', ['Alkanes']))).toBe('Organic Chemistry');
  });

  it('finishes a heading that was cut off and drops the unit number', () => {
    const c = course('Unit 3 ROBOT CONTROL AND DECISION M', ['Unit 3: ROBOT CONTROL AND DECISION MAKING']);
    expect(smartTitle(c)).toBe('Robot Control and Decision Making');
  });

  it('names an untitled course after its subject', () => {
    expect(smartTitle(course('Untitled course', ['Motion', 'Forces']))).toBe('Physics: Motion & Forces');
    expect(smartTitle(course('Untitled course', ['Algorithms', 'Sorting', 'Graphs', 'Trees']))).toBe('Computer science');
  });

  it('falls back to the first headings when the subject is not clear', () => {
    expect(smartTitle(course('', ['Welcome', 'Planning']))).toBe('Welcome & Planning');
  });

  it('works out the subject for the cover', () => {
    expect(courseSubject(course('Chemistry 101', ['Atoms'])).id).toBe('chemistry');
    expect(courseSubject(course('My plan', ['Hello'])).id).toBe('general');
  });
});
