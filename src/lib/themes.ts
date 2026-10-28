export const themes = ['system', 'light', 'dark'];
export const themeOptions = themes.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }));
export function applyTheme(theme: string) { if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme; }
