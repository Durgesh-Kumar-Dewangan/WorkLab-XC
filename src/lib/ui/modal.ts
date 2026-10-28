export type Modal = { id: string; kind?: string; leaving?: boolean; msg?: string };
export function useModal() { return { open: () => undefined, close: () => undefined }; }
export const modal = { open: () => undefined, close: () => undefined };
export const openModal = modal.open;
export const closeModal = modal.close;
