'use client';

import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

export type ModalAction = { label: string; kind?: string; value?: unknown; closes?: boolean; onClick?: () => unknown };
export type ModalEntry = {
  id: string;
  title?: string;
  body?: ReactNode;
  actions?: ModalAction[];
  cls?: string;
  wide?: boolean;
  onClose?: () => void;
};
export type ConfirmOptions = { title?: string; body?: string; confirmLabel?: string; danger?: boolean };

let nextId = 0;
let stack: ModalEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function openModal(entry: Omit<ModalEntry, 'id'>) {
  const id = `modal-${++nextId}`;
  stack = [...stack, { ...entry, id }];
  emit();
  return { id, close: () => closeModal(id) };
}

export function closeModal(id: string, value?: unknown) {
  const current = stack.find((item) => item.id === id);
  stack = stack.filter((item) => item.id !== id);
  current?.onClose?.();
  void value;
  emit();
}

export function useModals() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => stack,
    () => [],
  );
}

export function useModal() {
  return { open: openModal, close: closeModal };
}

export const modal = { open: openModal, close: closeModal };

export async function confirmBox(options: ConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  return window.confirm([options.title, options.body].filter(Boolean).join('\n\n') || options.confirmLabel || 'Are you sure?');
}
