export const NAV: [label: string, to: string, icon: string, test: (p: string) => boolean][] = [
  ['Dashboard', '/app', 'home', (p) => p === '/app'],
  ['Upload syllabus', '/app/upload', 'upload', (p) => p.startsWith('/app/upload')],
  // courses live inside Learn now: the path and the list of courses are two views of the same place
  [
    'Learn',
    '/app/learn',
    'class',
    (p) =>
      p.startsWith('/app/learn') ||
      (p.startsWith('/app/courses') && !p.includes('/graph') && !p.includes('/practice')),
  ],
  [
    'Practice',
    '/app/practice',
    'target',
    (p) => p === '/app/practice' || p.startsWith('/app/practice') || p.includes('/practice'),
  ],
  [
    'Leaderboard',
    '/app/leaderboard',
    'award',
    (p) => p.startsWith('/app/leaderboard') || p.startsWith('/app/play'),
  ],
  ['Study coach', '/app/study', 'cap', (p) => p.startsWith('/app/study')],
  ['Canvas', '/app/canvas', 'branch', (p) => p.startsWith('/app/canvas')],
  ['AI tutor', '/app/tutor', 'msg', (p) => p.startsWith('/app/tutor')],
  ['Knowledge graph', '/app/graph', 'graph', (p) => p === '/app/graph' || p.includes('/graph')],
  ['Saved', '/app/saved', 'folder', (p) => p.startsWith('/app/saved')],
  ['Progress', '/app/progress', 'trend', (p) => p.startsWith('/app/progress')],
];

export const ACCOUNT_NAV: typeof NAV = [
  ['Feedback', '/app/feedback', 'msg', (p) => p.startsWith('/app/feedback')],
  ['Notifications', '/app/notifications', 'bell', (p) => p.startsWith('/app/notifications')],
  ['Profile', '/app/profile', 'user', (p) => p.startsWith('/app/profile')],
  ['Settings', '/app/settings', 'settings', (p) => p.startsWith('/app/settings')],
];

const TITLES: Record<string, string> = {
  upload: 'Upload syllabus',
  learn: 'Learn',
  session: 'Learning session',
  saved: 'Saved',
  feedback: 'Feedback',
  admin: 'Admin',
  courses: 'Courses',
  graph: 'Knowledge graph',
  practice: 'Practice',
  tutor: 'AI tutor',
  canvas: 'Canvas',
  study: 'Study coach',
  play: 'Leaderboard',
  leaderboard: 'Leaderboard',
  progress: 'Progress',
  notifications: 'Notifications',
  profile: 'Profile',
  settings: 'Settings',
};

export type Crumb = [label: string, href: string | null];

/** Breadcrumbs from the pathname. `lookup` resolves course/topic ids to titles. */
export function crumbsFor(
  path: string,
  lookup: { course: (cid: string) => string | null; topic: (cid: string, tid: string) => string | null },
): Crumb[] {
  const out: Crumb[] = [['Workspace', '/app']];
  const seg = path.split('/').filter(Boolean).slice(1); // drop "app"
  if (!seg.length) return out;
  if (seg[0] !== 'courses' || seg.length === 1) {
    out.push([TITLES[seg[0]] ?? 'Page', null]);
    return out;
  }
  const cid = seg[1];
  out.push(['Courses', '/app/learn?view=courses']);
  const ct = lookup.course(cid) ?? 'Course';
  if (seg.length === 2) return [...out, [ct, null]];
  out.push([ct, `/app/courses/${cid}`]);
  if (seg[2] === 'topics') out.push([lookup.topic(cid, seg[3]) ?? 'Lesson', null]);
  else if (seg[2] === 'practice') out.push(['Practice', null]);
  else if (seg[2] === 'graph') out.push(['Graph', null]);
  return out;
}
