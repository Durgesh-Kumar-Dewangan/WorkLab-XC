import { createElement } from 'react';
import { api, ApiFail } from '@/lib/api/client';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { closeModal, openModal } from '@/lib/ui/modal';

export interface Slide {
  title: string;
  bullets: string[];
  narration: string;
  formula?: string;
  /** A short search for a real photograph of an example of this idea. */
  example?: string;
}
export type Diagram =
  | { kind: 'flow'; title: string; steps: { label: string; note?: string }[] }
  | { kind: 'cycle'; title: string; steps: { label: string; note?: string }[] }
  | { kind: 'tiers'; title: string; tiers: string[][] }
  | { kind: 'compare'; title: string; columns: { title: string; points: string[] }[] }
  | { kind: 'plot'; title: string; xLabel: string; yLabel: string; points: [number, number][] };
export interface Draft {
  depth?: 'quick' | 'standard' | 'deep';
  subject?: string;
  /** The in-depth lesson, built from zero one step at a time. */
  scratch?: { heading: string; body: string }[];
  glossary?: { term: string; meaning: string }[];
  mistakes?: string[];
  diagrams?: Diagram[];
  summary: string;
  objectives: string[];
  notes: string;
  slides: Slide[];
  questions: { q: string; options: string[]; answer: number; why: string }[];
}
export interface Prepared {
  state: 'reused' | 'shared' | 'generated';
  title: string;
  draft: Draft;
  libraryId: string | null;
}
export type GameRound =
  | { type: 'tf'; statement: string }
  | { type: 'order'; prompt: string; steps: string[] }
  | { type: 'match'; prompt: string; left: string[]; right: string[] };
export interface ProblemsOut {
  state: string;
  version: number;
  worked: { q: string; steps: string[]; answer: string }[];
  practice: { q: string; unit?: string; hint: string }[];
}
export interface CourseTopic {
  id: string;
  title: string;
  unit: string;
  mastery: number;
  seen: boolean;
  requires: string[];
}
export interface CourseProgress {
  topics: CourseTopic[];
  next: CourseTopic | null;
  reason: string;
}

/** Codes that mean "stop and explain" rather than "try again". */
export const STOP_CODES = new Set([
  'account_blocked',
  'vpn_blocked',
  'session_limit',
  'quota_exceeded',
  'byok_rejected',
  'byok_failed',
  'byok_rate_limited',
  'addon_required',
  'unauthenticated',
  'email_unverified',
]);

function askRating(sessionId: string) {
  return new Promise<void>((resolve) => {
    const m = openModal({
      title: 'How was your last lesson?',
      body: createElement(
        'div',
        null,
        createElement(
          'p',
          { className: 'body', style: { marginBottom: 14 } },
          'One quick rating before the next lesson helps us improve. It takes five seconds.',
        ),
        createElement(FeedbackForm, {
          sessionId,
          page: 'learn',
          submitLabel: 'Send and continue',
          onDone: () => closeModal(m.id),
        }),
      ),
      onClose: () => resolve(),
    });
  });
}

/** Starts a learning session. Asks for the previous rating when the server requires it. Other refusals are thrown for the caller to show. */
export async function startLearning(courseId: string | null, topicId: string | null): Promise<string> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await api<{ session: { id: string } }>('/sessions', { body: { courseId, topicId } });
      return r.session.id;
    } catch (e) {
      const f = e as ApiFail;
      if (f.code !== 'feedback_required') throw f;
      await askRating(String(f.extra.sessionId ?? ''));
    }
  }
  throw new ApiFail(403, 'feedback_required', 'Please rate your last lesson to continue.');
}
