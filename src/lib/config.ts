/** Optional backend wiring. Everything defaults to browser-only behaviour when the base URL is empty. */
export const API = {
  base: process.env.NEXT_PUBLIC_WLXC_API_BASE ?? '',
  plans: process.env.NEXT_PUBLIC_WLXC_API_PLANS ?? '/plans',
  checkout: process.env.NEXT_PUBLIC_WLXC_API_CHECKOUT ?? '/checkout',
  leads: process.env.NEXT_PUBLIC_WLXC_API_LEADS ?? '/leads',
  auth: process.env.NEXT_PUBLIC_WLXC_API_AUTH ?? '',
  currency: process.env.NEXT_PUBLIC_WLXC_CURRENCY ?? '$',
};

export const hasBackend = () => API.base.length > 0;
export const apiUrl = (path: string) => API.base.replace(/\/$/, '') + path;
