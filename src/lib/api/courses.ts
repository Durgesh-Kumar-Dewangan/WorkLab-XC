import type { Course } from '../domain/types';
import { tidyCourse } from '../course-identity';
import { api, uploadForm } from './client';

interface CourseDoc {
  id: string;
  course: Course;
  updated: number;
}

/** Every course the signed-in learner has, as stored on the server. */
export async function fetchCourses(): Promise<Course[]> {
  const { courses } = await api<{ courses: { id: string }[] }>('/courses');
  const docs = await Promise.all(courses.map((c) => api<CourseDoc>(`/courses/${encodeURIComponent(c.id)}`)));
  return docs.map((d) => tidyCourse({ ...d.course, source: 'upload' as const }));
}

/** Parses a syllabus on the server (pasted text or a file) and stores it as a new course. */
export async function createCourse(
  input: { text: string; title?: string } | { file: File; title?: string },
  onUpload?: (sent: number, total: number) => void,
): Promise<Course> {
  let created: { id: string };
  if ('file' in input) {
    const form = new FormData();
    form.append('file', input.file);
    if (input.title) form.append('title', input.title);
    created = onUpload ? await uploadForm<{ id: string }>('/courses', form, onUpload) : await api<{ id: string }>('/courses', { form });
  } else {
    created = await api<{ id: string }>('/courses', { body: { text: input.text, title: input.title ?? '' } });
  }
  const d = await api<CourseDoc>(`/courses/${encodeURIComponent(created.id)}`);
  return tidyCourse({ ...d.course, source: 'upload' });
}

export async function deleteCourse(id: string): Promise<void> {
  await api(`/courses/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
