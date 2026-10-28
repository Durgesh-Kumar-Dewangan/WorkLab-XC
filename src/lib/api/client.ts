import { apiUrl, hasBackend } from '../config';

/** An error answered by the server, with its machine code (for example `feedback_required`). */
export class ApiFail extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface Req {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

/** Tells the server how good this connection is, so it can leave out heavy extras on a weak link. */
function netHeader(): Record<string, string> {
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  })();
  const base: Record<string, string> = tz ? { 'x-wlxc-tz': tz } : {}; // the clock, for when the connection does not say where it is
  try {
    const c = (
      navigator as unknown as {
        connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
      }
    ).connection;
    if (!c) return base;
    const v = [
      `ect=${c.effectiveType ?? ''}`,
      `downlink=${c.downlink ?? ''}`,
      `rtt=${c.rtt ?? ''}`,
      `save-data=${c.saveData ? 'on' : 'off'}`,
    ].join(';');
    return { ...base, 'x-wlxc-net': v };
  } catch {
    return base;
  }
}

/** Same-origin call to this app's own API. Cookies carry the session; nothing secret lives in the browser. */
export async function api<T = Record<string, unknown>>(path: string, o: Req = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: o.method ?? (o.body !== undefined || o.form ? 'POST' : 'GET'),
      headers: { ...netHeader(), ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
      credentials: 'same-origin',
      signal: o.signal,
    });
  } catch {
    throw new ApiFail(0, 'network', 'Could not reach WorkLab XC. Check your connection and try again.');
  }
  const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string } & Record<
    string,
    unknown
  >;
  if (!res.ok) {
    const { error, message, ...extra } = j;
    throw new ApiFail(res.status, error ?? 'error', message ?? 'Something went wrong. Try again.', extra);
  }
  return j as T;
}

export { hasBackend };

/**
 * Sends a form (a file) and reports how much has gone up, for a progress bar. Uses XMLHttpRequest because fetch cannot report
 * upload progress. Errors are the same ApiFail the rest of the app handles.
 */
export function uploadForm<T = Record<string, unknown>>(
  path: string,
  form: FormData,
  onProgress: (sent: number, total: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(path));
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded, e.total);
    xhr.onerror = () =>
      reject(new ApiFail(0, 'network', 'Could not reach WorkLab XC. Check your connection and try again.'));
    xhr.onload = () => {
      let j: Record<string, unknown> = {};
      try {
        j = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* an empty or non-JSON answer is handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(j as T);
      const { error, message, ...extra } = j as { error?: string; message?: string } & Record<
        string,
        unknown
      >;
      reject(new ApiFail(xhr.status, error ?? 'error', message ?? 'Something went wrong. Try again.', extra));
    };
    xhr.send(form);
  });
}

export interface ServerUser {
  id: string;
  name: string;
  email: string;
  plan: 'prototype' | 'learner' | 'classroom';
  planUntil: number | null;
  emailVerified: boolean;
  admin: boolean;
  dev?: boolean;
  username?: string;
  /** True while the learner's own AI key is connected: every feature is open and none of our limits apply. */
  byok?: boolean;
}
export interface Me {
  user: ServerUser;
  limits: {
    /** Whether this plan includes the 3D classroom. */
    classroom: boolean;
    /** True while the account sees ads: the free plan, unless the Ad-free add-on is active. */
    ads?: boolean;
    /** Topics a plan without the full classroom may open in it each month (0 when it is unlimited or not offered). */
    classroomPerMonth?: number;
    examsPerDay?: number;
    jobsPerDay: number;
    topicsPerJob: number;
    imagesPerDay: number;
    watermark: boolean;
    customInstructions: boolean;
    pdfDocx: boolean;
  };
  usage: { jobs: number; images: number };
  /** [used, allowed] for today, by kind. */
  today?: Record<'sessions' | 'lessons' | 'exams' | 'chat', [number, number]>;
  /** [used, allowed] for this month. Present only on plans with a monthly classroom allowance. */
  month?: {
    classroom?: [number, number];
    chat?: [number, number];
    notes?: [number, number];
  };
  feedbackRequired: boolean;
  /** Whether this learner receives product emails (announcements and plan offers). Service notices are always sent. */
  mailPrefs?: { marketing: boolean };
}
export interface DeckStyleInfo {
  id: string;
  name: string;
  description: string;
  bg?: string;
  ink?: string;
  accent?: string;
}
export interface TopicOut {
  id: string;
  title: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  score: number | null;
  image: boolean;
  error: string | null;
  warning: string | null;
  reused?: boolean;
}
export interface JobOut {
  id: string;
  courseId: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'canceled';
  error: string | null;
  progress: { total: number; done: number; failed: number };
  topics: TopicOut[];
  downloads: ('pptx' | 'md' | 'json')[];
  watermark: boolean;
  images: boolean;
  style?: string;
}
export interface CourseOut {
  id: string;
  course: { id: string; title: string; order: string[]; topics: Record<string, { title: string }> };
  notes: string[];
  aiPrerequisites: boolean;
}
export interface LibraryItem {
  id: string;
  kind: 'topic' | 'deck';
  title: string;
  tags: string[];
  source: 'generated' | 'edited' | 'uploaded';
  version: number;
  courseTitle: string | null;
  hasImage: boolean;
  hasFile: boolean;
  fileName: string | null;
  slides: number | null;
  summary: string | null;
  uses: number;
  created: number;
  updated: number;
}
export interface ReuseMatch {
  id: string;
  title: string;
  score: number;
  how: 'exact' | 'meaning' | 'words';
  source: string;
}
