'use client';
import { useApp } from './index';
export const useCourses = () => useApp((state) => state.courses ?? []);
export const useCourse = (id?: string) => useApp((state) => (state.courses ?? []).find((course: any) => course.id === id));
export const useLearner = () => useApp((state) => state.learner ?? state.profile ?? {});
