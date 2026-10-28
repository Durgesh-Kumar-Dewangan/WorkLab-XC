export const toast: any = Object.assign((message: string) => emit(message), { success: (message: string) => emit(message), error: (message: string) => emit(message), info: (message: string) => emit(message), message: (message: string) => emit(message) });
function emit(message: string) { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('worklab:toast', { detail: message })); }
export const copyText = async (text: string) => { await navigator.clipboard?.writeText(text); toast.success('Copied'); };
export function useToasts(): any[] { return []; }
