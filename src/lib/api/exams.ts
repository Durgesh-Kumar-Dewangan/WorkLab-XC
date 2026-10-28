import { api } from './client';

export interface ExamQuestion {
  type: 'mcq' | 'short' | 'long';
  q: string;
  marks: number;
  options?: string[];
  // revealed once the exam is marked
  answer?: number;
  why?: string;
  modelAnswer?: string;
  rubric?: string[];
}
export interface QuestionResult {
  marks: number;
  max: number;
  choice?: number | null;
  answer?: string;
  feedback?: string;
}
export interface ExamResult {
  scored: number;
  total: number;
  percent: number;
  perQuestion: QuestionResult[];
  seconds?: number;
  mode?: 'typed' | 'sheet';
  legibility?: 'good' | 'fair' | 'poor';
  note?: string;
}
export interface Exam {
  id: string;
  title: string;
  instructions: string;
  courseId: string;
  courseTitle: string;
  topicTitles: string[];
  minutes: number;
  totalMarks: number;
  questions: ExamQuestion[];
  status: 'open' | 'marked';
  created: number;
  result?: ExamResult;
}
export interface ExamSummary {
  id: string;
  title: string;
  courseTitle: string;
  status: 'open' | 'marked';
  created: number;
  minutes: number;
  totalMarks: number;
  scored?: number;
  questions: number;
}
export interface NewExam {
  courseId: string;
  topicIds: string[];
  count: number;
  minutes: number;
  kinds: ('mcq' | 'short' | 'long')[];
  difficulty: 'easy' | 'medium' | 'hard';
}
export interface TypedAnswer {
  i: number;
  choice?: number;
  text?: string;
}

export const createExam = (b: NewExam) => api<{ exam: Exam }>('/exams', { body: b }).then((r) => r.exam);
export const getExam = (id: string) => api<{ exam: Exam }>(`/exams/${encodeURIComponent(id)}`).then((r) => r.exam);
export const listExams = () => api<{ exams: ExamSummary[] }>('/exams').then((r) => r.exams);
export const submitExam = (id: string, answers: TypedAnswer[], seconds: number) =>
  api<{ exam: Exam }>(`/exams/${encodeURIComponent(id)}/submit`, { body: { answers, seconds } }).then((r) => r.exam);

/** Marks a handwritten sheet. Each page goes up as its own file field. */
export function submitSheet(id: string, pages: Blob[]) {
  const form = new FormData();
  pages.forEach((p, i) => form.append(`file${i}`, p, `page-${i + 1}.jpg`));
  return api<{ exam: Exam }>(`/exams/${encodeURIComponent(id)}/sheet`, { form }).then((r) => r.exam);
}

/** Shrinks a phone photo to a size the server accepts and the AI can still read (long edge 1700px, JPEG). */
export function shrinkPhoto(file: File, edge = 1700): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, edge / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that photo.'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that photo.'));
    };
    img.src = url;
  });
}
