export type AvatarPose = 'talk' | 'point' | 'think' | 'wave';
export type CamName = 'board' | 'close' | 'model' | 'overview' | 'teacher';
export type DemoKind = 'cart' | 'projectile' | 'pendulum' | 'orbit' | 'concept';
export type TopicStatus = 'new' | 'learning' | 'review' | 'mastered';

/** Parameters understood by the 2D / 3D simulations. All optional; each demo reads what it needs. */
export interface SimParams {
  force?: number;
  mass?: number;
  v0?: number;
  friction?: number;
  speed?: number;
  angle?: number;
  [key: string]: number | undefined;
}

export interface Slide {
  t: string;
  b: string[];
  say: string;
  av: AvatarPose;
  cam: CamName;
  /** Formula(s) shown on the board. */
  f?: string | string[];
  /** Simulation preset applied when this slide appears. */
  p?: SimParams;
  /** Optional mini-quiz shown by the classroom after this slide. */
  check?: { q: string; opts: string[]; ans: number; why: string };
  /** A search for a real-world photograph to show beside this slide. */
  ex?: string;
}

export interface McqQuestion {
  type: 'mcq';
  q: string;
  opts: string[];
  ans: number;
  why: string;
}
export interface NumQuestion {
  type: 'num';
  q: string;
  ans: number;
  tol: number;
  unit: string;
  why: string;
}
export interface ConfQuestion {
  type: 'conf';
  q: string;
  why: string;
}
export type Question = McqQuestion | NumQuestion | ConfQuestion;

export type RelKind = string;

export interface Topic {
  id: string;
  u: string;
  page: number | null;
  title: string;
  mins: number;
  demo: DemoKind;
  req: string[];
  inf?: string[];
  rel?: [string, RelKind][];
  summary: string;
  obj: string[];
  slides: Slide[];
  qs: Question[];
  /** True once the server has written a real lesson for this topic (otherwise it is a template from the heading). */
  ai?: boolean;
  /** The lesson's study notes (Markdown), when the server wrote them. */
  notes?: string;
  /** How deep the saved lesson is. */
  depth?: 'quick' | 'standard' | 'deep';
  uncertain?: boolean;
  /** One word for what the lesson is about, so the classroom screen can look like it. */
  subject?: string;
  infWhy?: string;
}

export interface Unit {
  id: string;
  title: string;
  page: number | null;
  topics: string[];
}

export interface Course {
  id: string;
  title: string;
  subtitle: string;
  source: 'upload';
  sourceName: string;
  units: Unit[];
  topics: Record<string, Topic>;
  order: string[];
  created: number;
  template?: boolean;
}

export type EdgeType = 'req' | 'inf' | 'rel' | 'manual';
export type EdgeStatus = 'confirmed' | 'inferred' | 'accepted' | 'rejected';
export interface Edge {
  from: string;
  to: string;
  type: EdgeType;
  status: EdgeStatus;
  key: string;
  kind?: string;
}

export interface GraphEdits {
  accepted: string[];
  rejected: string[];
  renamed: Record<string, string>;
  added: [string, string][];
  removed: string[];
}

export interface Mastery {
  att: number;
  cor: number;
  est: number;
  last: number;
  conf: number | null;
  wrongStreak: number;
}

export interface Recommendation {
  id: string;
  kind: 'prereq' | 'review' | 'next' | 'continue' | 'refresh';
  reason: string;
}
