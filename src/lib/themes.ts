export type ThemeDefinition = {
  id: string;
  name: string;
  note: string;
  group: string;
  swatch: [string, string, string, string];
};

export const THEMES: ThemeDefinition[] = [
  { id: 'wondering', name: 'Wondering', note: 'Warm and curious', group: 'Core', swatch: ['#fffaf0', '#ffffff', '#ff6b3d', '#202124'] },
  { id: 'instagram', name: 'Instagram', note: 'Bright and social', group: 'Core', swatch: ['#fff7fb', '#ffffff', '#d62976', '#26152b'] },
  { id: 'worldlab', name: 'Worldlab', note: 'Calm and focused', group: 'Core', swatch: ['#eef5f8', '#ffffff', '#147d92', '#17313b'] },
  { id: 'playful', name: 'Playful', note: 'Bold and energetic', group: 'Core', swatch: ['#fff9e8', '#ffffff', '#f08c00', '#30210e'] },
  { id: 'scenic', name: 'Scenic', note: 'A quiet landscape', group: 'Core', swatch: ['#0b1424', 'rgba(14,23,42,.7)', '#e07a10', '#fbf6ea'] },
];

export const ACCENTS = ['#2563eb', '#d62976', '#12a150', '#e07a10', '#8b5cf6'];
export const themes = ['system', 'light', 'dark'];
export const themeOptions = themes.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }));

export function applyTheme(theme: string) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}

export function applyCustom(custom: { theme?: string; accent?: string; scenicTone?: string }) {
  if (typeof document === 'undefined') return;
  if (custom.theme) document.documentElement.dataset.theme = custom.theme;
  if (custom.accent) document.documentElement.style.setProperty('--accent', custom.accent);
}
