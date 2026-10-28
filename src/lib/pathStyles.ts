import type { PathStyle } from '@/lib/store/types';

/** The six looks for the learning path, each drawn after a kind of game with levels. */
export const PATH_STYLES: { id: PathStyle; name: string; note: string; colors: [string, string, string] }[] = [
  { id: 'classic', name: 'Classic', note: 'Round stepping stones with progress rings', colors: ['#2f7bff', '#e5e7ee', '#58cc02'] },
  { id: 'candy', name: 'Candy', note: 'Glossy sweets on a curly road, like a match-three map', colors: ['#ff5fa2', '#ffe3f0', '#ffb703'] },
  { id: 'pixel', name: 'Pixel quest', note: '8-bit squares and a flag, like an old platformer world map', colors: ['#e52521', '#fbd000', '#049cd8'] },
  { id: 'summit', name: 'Summit', note: 'Stone steps up a mountain, with a flag at the top', colors: ['#6b8e4e', '#d9cdb4', '#c8553d'] },
  { id: 'galaxy', name: 'Galaxy', note: 'Glowing planets on an orbit, deep space behind', colors: ['#8b5cf6', '#0b1020', '#22d3ee'] },
  { id: 'dungeon', name: 'Dungeon', note: 'Hexagon tiles, torch light and treasure chests', colors: ['#d97706', '#2a2118', '#a3e635'] },
];
