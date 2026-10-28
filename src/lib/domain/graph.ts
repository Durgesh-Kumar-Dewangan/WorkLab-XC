import { courseEdges, type LearnerData } from './courses';
import type { Course, Edge } from './types';

export const UNIT_COLORS = ['#2f7bff', '#7c4dff', '#d46bff', '#59f286', '#ffb84d', '#ff6b7a'];
export const STATUS_COLOR = {
  new: 'var(--fg3)',
  learning: 'var(--blue)',
  review: 'var(--amber)',
  mastered: 'var(--green)',
} as const;

type EdgeData = Pick<LearnerData, 'graphEdits'>;

/** Adding from->to makes a cycle if `from` is reachable from `to`. */
export function wouldCycle(d: EdgeData, c: Course, from: string, to: string): boolean {
  const out: Record<string, string[]> = {};
  courseEdges(d, c)
    .filter((e) => e.type !== 'rel' && e.status !== 'rejected')
    .forEach((e) => (out[e.from] ??= []).push(e.to));
  const seen = new Set<string>();
  const st = [to];
  while (st.length) {
    const n = st.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    (out[n] ?? []).forEach((x) => st.push(x));
  }
  return false;
}

export interface NodePos {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface GraphHead {
  x: number;
  y: number;
  label: string;
  uid?: string;
  n: number;
  collapsed?: boolean;
  side?: boolean;
}
export interface GraphLayout {
  pos: Record<string, NodePos>;
  heads: GraphHead[];
  W: number;
  H: number;
  edges: Edge[];
  NW: number;
  NH: number;
}

export type GraphView = 'layered' | 'unit';

export function layoutGraph(
  d: EdgeData,
  c: Course,
  view: GraphView,
  collapsed: ReadonlySet<string>,
): GraphLayout {
  const edges = courseEdges(d, c).filter((e) => e.type !== 'rel' && e.status !== 'rejected');
  const inc: Record<string, string[]> = {};
  edges.forEach((e) => (inc[e.to] ??= []).push(e.from));
  const depth: Record<string, number> = {};
  const visiting = new Set<string>();
  const dfs = (id: string): number => {
    if (depth[id] !== undefined) return depth[id];
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let dd = 0;
    (inc[id] ?? []).forEach((p) => {
      dd = Math.max(dd, dfs(p) + 1);
    });
    visiting.delete(id);
    depth[id] = dd;
    return dd;
  };
  c.order.forEach(dfs);

  const NW = 188;
  const NH = 54;
  const pos: Record<string, NodePos> = {};
  const heads: GraphHead[] = [];
  if (view === 'unit') {
    let x = 0;
    c.units.forEach((u) => {
      heads.push({ x, y: 0, label: u.title, uid: u.id, n: u.topics.length, collapsed: collapsed.has(u.id) });
      u.topics.forEach((id, k) => {
        if (!collapsed.has(u.id)) pos[id] = { x, y: 44 + k * (NH + 22), w: NW, h: NH };
      });
      x += NW + 70;
    });
  } else {
    const rows: Record<number, string[]> = {};
    c.order.forEach((id) => (rows[depth[id]] ??= []).push(id));
    const maxCols = Math.max(...Object.values(rows).map((a) => a.length));
    const rowW = maxCols * (NW + 26) - 26;
    Object.keys(rows).forEach((key) => {
      const dKey = +key;
      const a = rows[dKey];
      const w = a.length * (NW + 26) - 26;
      const off = 70 + (rowW - w) / 2;
      const y = 8 + dKey * (NH + 50);
      a.forEach((id, k) => (pos[id] = { x: off + k * (NW + 26), y, w: NW, h: NH }));
      heads.push({
        x: 0,
        y: y + NH / 2 - 8,
        label: dKey === 0 ? 'Start' : `Step ${dKey + 1}`,
        n: 0,
        side: true,
      });
    });
  }
  const xs = Object.values(pos)
    .map((p) => p.x + p.w)
    .concat(view === 'unit' ? heads.map((hh) => hh.x + NW) : []);
  const ys = Object.values(pos)
    .map((p) => p.y + p.h)
    .concat([60]);
  return { pos, heads, W: Math.max(...xs, 300), H: Math.max(...ys, 200), edges, NW, NH };
}

/** Transitive ancestors and descendants of `selected` over active or inferred links. */
export function chainOf(edges: Edge[], selected: string | null): { up: Set<string>; down: Set<string> } {
  const up = new Set<string>();
  const down = new Set<string>();
  if (!selected) return { up, down };
  const e = edges.filter(
    (x) =>
      (x.type !== 'rel' && (x.status === 'confirmed' || x.status === 'accepted')) || x.status === 'inferred',
  );
  let st = [selected];
  while (st.length) {
    const n = st.pop()!;
    e.filter((x) => x.to === n).forEach((x) => {
      if (!up.has(x.from)) {
        up.add(x.from);
        st.push(x.from);
      }
    });
  }
  st = [selected];
  while (st.length) {
    const n = st.pop()!;
    e.filter((x) => x.from === n).forEach((x) => {
      if (!down.has(x.to)) {
        down.add(x.to);
        st.push(x.to);
      }
    });
  }
  return { up, down };
}

/** Bezier path for an edge between two laid-out nodes. */
export function edgePath(a: NodePos, b: NodePos, view: GraphView): string {
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = b.x;
  const y2 = b.y + b.h / 2;
  const bk = x2 > x1 + 20;
  const dx = bk ? Math.max(40, (x2 - x1) / 2) : 80;
  const vx1 = a.x + a.w / 2;
  const vy1 = a.y + a.h;
  const vx2 = b.x + b.w / 2;
  const vy2 = b.y;
  const vdy = Math.max(26, Math.abs(vy2 - vy1) / 2);
  if (view !== 'unit') return `M${vx1} ${vy1} C${vx1} ${vy1 + vdy} ${vx2} ${vy2 - vdy} ${vx2} ${vy2}`;
  if (bk) return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
  return `M${a.x + a.w / 2} ${a.y + a.h} C${a.x + a.w / 2} ${a.y + a.h + 40} ${b.x + b.w / 2} ${b.y - 40} ${b.x + b.w / 2} ${b.y}`;
}

/** Two-line label split used for node text. */
export function splitLabel(title: string): [string, string] {
  let l1 = '';
  let l2 = '';
  title.split(' ').forEach((w) => {
    if (`${l1} ${w}`.trim().length <= 24 && !l2) l1 = `${l1} ${w}`.trim();
    else l2 = `${l2} ${w}`.trim();
  });
  if (l2.length > 24) l2 = `${l2.slice(0, 22)}…`;
  return [l1, l2];
}
