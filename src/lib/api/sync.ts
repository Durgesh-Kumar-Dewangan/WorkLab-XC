'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { useApp } from '../store';
import { ApiFail, api, type Me } from './client';
import { fetchCourses } from './courses';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/** Whether this browser has loaded the signed-in learner's data from the server yet. Not persisted. */
export const useSync = create<{ status: Status; error: string }>(() => ({ status: 'idle', error: '' }));

let inflight: Promise<void> | null = null;

/** Confirms the session with the server and loads the learner's courses. A 401 signs the learner out. */
export function syncFromServer(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && useSync.getState().status === 'ready') return Promise.resolve();
  useSync.setState({ status: 'loading', error: '' });
  inflight = (async () => {
    try {
      const me = await api<Me>('/me');
      const app = useApp.getState();
      app.updateProfile({ name: me.user.name, email: me.user.email });
      const prof = await api<{ profile: { age?: number; photo?: string } }>('/profile').catch(() => null);
      if (prof) app.updateProfile({ age: prof.profile.age ?? 0, photo: prof.profile.photo ?? '' });
      const courses = await fetchCourses();
      app.setCourses(courses);
      const progress = await Promise.all(
        courses.map((c) =>
          api<{ topics: { id: string; mastery: number; seen: boolean; last: number | null }[] }>(
            `/learn/progress?courseId=${encodeURIComponent(c.id)}`,
          ).catch(() => ({ topics: [] })),
        ),
      );
      const known: Record<string, { est: number; last: number | null }> = {};
      progress.forEach((p) => p.topics.forEach((t) => t.seen && (known[t.id] = { est: t.mastery, last: t.last })));
      app.mergeServerMastery(known);
      const act = await api<{ days: { day: string; minutes?: number }[] }>('/learn/activity').catch(() => null);
      if (act) app.mergeMinutes(Object.fromEntries(act.days.filter((d) => d.minutes).map((d) => [d.day, d.minutes as number])));
      useSync.setState({ status: 'ready', error: '' });
    } catch (e) {
      if (e instanceof ApiFail && e.status === 401) {
        useApp.getState().signOut();
        useSync.setState({ status: 'idle', error: '' });
      } else {
        useSync.setState({ status: 'error', error: e instanceof Error ? e.message : 'Could not load your data.' });
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Call once from each signed-in shell: loads the learner's data and reports where that stands. */
export function useServerSync() {
  const signedIn = useApp((s) => !!s.session);
  const { status, error } = useSync();
  useEffect(() => {
    if (signedIn && status === 'idle') void syncFromServer();
    if (!signedIn && status !== 'idle') useSync.setState({ status: 'idle', error: '' });
  }, [signedIn, status]);
  return { status, error, retry: () => void syncFromServer(true) };
}
