export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type ThemePref = 'light' | 'dark' | 'system';
export type CustomLook = Record<string, string>;
export type Settings = Record<string, any>;
export type PathStyle = string;
export type GlbInfo = { id?: string; url?: string; name?: string; [key: string]: any };
