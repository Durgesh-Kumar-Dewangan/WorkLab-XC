let token = '';

/** The site key of the Cloudflare Turnstile check, or '' when it is not switched on. */
export const turnstileSiteKey = () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
export const setTurnstileToken = (t: string) => {
  token = t;
};
export const getTurnstileToken = () => token;

/** Forgets a used token and asks the widget for a fresh one (a token works once). */
export function resetTurnstile() {
  token = '';
  try {
    (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
  } catch {
    /* the widget is not on this page */
  }
}
