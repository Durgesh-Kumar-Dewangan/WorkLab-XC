'use client';
import { useSyncExternalStore } from 'react';

type State = Record<string, any>;
const state: State = new Proxy({
  theme: 'light',
  settings: {
    motion: 'full',
    textSize: 'normal',
    themedElements: true,
    halftone: false,
    scenicTone: 'dusk',
    custom: {},
  },
  profile: {},
  session: null,
  courses: [],
  notifications: [],
  minutes: {},
  mastery: {},
  gameBest: {},
  assets: {},
} as State, {
  get(target, key: string | symbol) {
    if (key in target) return target[key as keyof State];
    if (typeof key === 'string' && key.startsWith('set')) return (...args: any[]) => Object.assign(target, args[0] ?? {});
    return undefined;
  },
});
const listeners = new Set<() => void>();
export function getApp(): any { return state; }
export const useApp: any = <T = any>(selector: (state: any) => T): T => selector(useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state, () => state));
export function useHydrated() { return useSyncExternalStore(() => () => undefined, () => true, () => true); }
export function updateApp(values: Record<string, unknown>) { Object.assign(state, values); listeners.forEach((listener) => listener()); }
(useApp as any).getState = () => state;
(useApp as any).setState = updateApp;
