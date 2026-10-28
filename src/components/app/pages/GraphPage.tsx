'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { EmptyWorkspace } from '@/components/app/EmptyWorkspace';
import { CourseMissing } from '@/components/app/EmptyWorkspace';
import { courseEdges, courseMastery, edgeActive, masteryOf, statusFor, topicTitle } from '@/lib/domain/courses';
import { STATUS_COLOR, UNIT_COLORS } from '@/lib/domain/graph';
import { STATUS_LABEL } from '@/lib/domain/mastery';
import type { Course, Edge, Topic, Unit } from '@/lib/domain/types';
import { useApp } from '@/lib/store';
import { useCourses, useLearner } from '@/lib/store/hooks';

/*
 * The knowledge map drills down: all subjects, then the units of a subject, then the topics of a unit with how they
 * depend on each other, then the sub-topics inside one topic. Click a node to go deeper; use the trail above to go back.
 */

interface Path {
  cid?: string;
  uid?: string;
  tid?: string;
}

const W = 1000;
const H = 560;

function wrap(text: string, max = 18, lines = 2): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  const r = out.slice(0, lines);
  if (out.length > lines) r[lines - 1] = r[lines - 1].replace(/.{0,2}$/, '…');
  return r;
}

function Label({ x, y, text, size = 13, max = 18, lines = 2, fill = 'var(--fg)', weight = 500 }: { x: number; y: number; text: string; size?: number; max?: number; lines?: number; fill?: string; weight?: number }) {
  const ls = wrap(text, max, lines);
  const y0 = y - ((ls.length - 1) * (size + 2)) / 2;
  return (
    <text textAnchor="middle" fontSize={size} fontWeight={weight} fill={fill} style={{ pointerEvents: 'none' }}>
      {ls.map((l, i) => (
        <tspan key={i} x={x} y={y0 + i * (size + 2) + size * 0.35}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function Ring({ x, y, r, value, color }: { x: number; y: number; r: number; value: number; color: string }) {
  const c = 2 * Math.PI * r;
  return (
    <g transform={`rotate(-90 ${x} ${y})`} style={{ pointerEvents: 'none' }}>
      <circle cx={x} cy={y} r={r} fill="none" stroke="var(--line2)" strokeWidth={6} opacity={0.6} />
      <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${c * Math.max(0.001, value)} ${c}`} />
    </g>
  );
}

/** Subtopics of a topic: the lesson's slide titles, or its learning objectives when the lesson has not been written. */
function subtopics(t: Topic): string[] {
  return t.ai && t.slides.length ? t.slides.map((s) => s.t) : [];
}

function Crumbs({ path, cs, c, u, t, go }: { path: Path; cs: Course[]; c?: Course; u?: Unit; t?: Topic; go: (p: Path) => void }) {
  const d = useLearner();
  return (
    <nav className="kg-trail" aria-label="Where you are in the map">
      <button type="button" onClick={() => go({})} aria-current={!path.cid ? 'page' : undefined}>
        All subjects
      </button>
      {c ? (
        <>
          <span aria-hidden="true">›</span>
          <button type="button" onClick={() => go({ cid: c.id })} aria-current={!path.uid ? 'page' : undefined}>
            {c.title}
          </button>
        </>
      ) : null}
      {u ? (
        <>
          <span aria-hidden="true">›</span>
          <button type="button" onClick={() => go({ cid: c!.id, uid: u.id })} aria-current={!path.tid ? 'page' : undefined}>
            {u.title}
          </button>
        </>
      ) : null}
      {t && c ? (
        <>
          <span aria-hidden="true">›</span>
          <button type="button" aria-current="page">
            {topicTitle(d, c, t.id)}
          </button>
        </>
      ) : null}
      {cs.length === 0 ? null : null}
    </nav>
  );
}

function Canvas({ children, h = H, w = W, label }: { children: React.ReactNode; h?: number; w?: number; label: string }) {
  return (
    <div className="kg-canvas">
      <svg viewBox={`0 0 ${w} ${h}`} role="group" aria-label={label} style={{ width: '100%', minWidth: Math.min(w, 720), height: 'auto' }}>
        <defs>
          <filter id="kg-shadow" x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow dx="0" dy="5" stdDeviation="7" floodColor="#000" floodOpacity="0.2" />
          </filter>
          <marker id="kg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="var(--fg3)" />
          </marker>
        </defs>
        {children}
      </svg>
    </div>
  );
}

/* ---------- level 0: subjects ---------- */
function Subjects({ cs, go }: { cs: Course[]; go: (p: Path) => void }) {
  const d = useLearner();
  const cols = Math.min(cs.length, 3);
  const rows = Math.ceil(cs.length / cols);
  return (
    <Canvas label="Your subjects" h={Math.max(380, rows * 260)}>
      {cs.map((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = ((col + 0.5) * W) / cols;
        const y = 150 + row * 260;
        const r = Math.min(105, 58 + Math.sqrt(c.order.length) * 8);
        const m = courseMastery(d, c);
        const color = UNIT_COLORS[i % UNIT_COLORS.length];
        return (
          <g key={c.id} className="kg-node kg-pop" style={{ animationDelay: `${i * 70}ms` }} tabIndex={0} role="button" aria-label={`${c.title}, ${c.units.length} units, ${c.order.length} topics`} onClick={() => go({ cid: c.id })} onKeyDown={(e) => e.key === 'Enter' && go({ cid: c.id })}>
            <circle cx={x} cy={y} r={r + 9} fill={`color-mix(in srgb, ${color} 7%, transparent)`} />
            <circle cx={x} cy={y} r={r} fill={`color-mix(in srgb, ${color} 16%, var(--panel))`} stroke={color} strokeWidth={2} filter="url(#kg-shadow)" />
            <Ring x={x} y={y} r={r + 9} value={m} color={color} />
            <Label x={x} y={y - 6} text={c.title} size={15} max={16} lines={3} weight={600} />
            <text x={x} y={y + r - 22} textAnchor="middle" fontSize={11.5} fill="var(--fg3)" style={{ pointerEvents: 'none' }}>
              {`${c.units.length} units · ${c.order.length} topics`}
            </text>
            <text x={x} y={y + r + 30} textAnchor="middle" fontSize={12} fill="var(--fg2)" style={{ pointerEvents: 'none' }}>
              {`${Math.round(m * 100)}% estimate`}
            </text>
          </g>
        );
      })}
    </Canvas>
  );
}

/* ---------- level 1: units of a subject ---------- */
function Units({ c, go }: { c: Course; go: (p: Path) => void }) {
  const d = useLearner();
  const n = c.units.length;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 360;
  const ry = 195;
  const pos = c.units.map((_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  });
  return (
    <Canvas label={`Units in ${c.title}`}>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="var(--line)" strokeWidth={1.2} strokeDasharray="2 7" />
      {pos.map(([x, y], i) => (
        <line key={`l${i}`} x1={cx} y1={cy} x2={x} y2={y} stroke={UNIT_COLORS[i % UNIT_COLORS.length]} strokeOpacity={0.45} strokeWidth={1.8} />
      ))}
      {n > 2
        ? pos.map(([x, y], i) => {
            const [x2, y2] = pos[(i + 1) % n];
            return <line key={`o${i}`} x1={x} y1={y} x2={x2} y2={y2} stroke="var(--line2)" strokeWidth={1.4} strokeDasharray="4 5" className="kg-flow" markerEnd="url(#kg-arrow)" />;
          })
        : null}
      <circle cx={cx} cy={cy} r={64} fill="var(--panel2)" stroke="var(--line2)" strokeWidth={2} filter="url(#kg-shadow)" />
      <Label x={cx} y={cy} text={c.title} size={14} max={14} lines={3} weight={600} />
      {c.units.map((u, i) => {
        const [x, y] = pos[i];
        const color = UNIT_COLORS[i % UNIT_COLORS.length];
        const est = u.topics.length ? u.topics.reduce((s, id) => s + masteryOf(d, id).est, 0) / u.topics.length : 0;
        const r = 40 + Math.sqrt(u.topics.length) * 9;
        return (
          <g key={u.id} className="kg-node kg-pop" style={{ animationDelay: `${i * 70}ms` }} tabIndex={0} role="button" aria-label={`${u.title}, ${u.topics.length} topics`} onClick={() => go({ cid: c.id, uid: u.id })} onKeyDown={(e) => e.key === 'Enter' && go({ cid: c.id, uid: u.id })}>
            <circle cx={x} cy={y} r={r} fill={`color-mix(in srgb, ${color} 16%, var(--panel))`} stroke={color} strokeWidth={2} filter="url(#kg-shadow)" />
            <Ring x={x} y={y} r={r + 8} value={est} color={color} />
            <Label x={x} y={y - 4} text={u.title} size={13} max={15} lines={3} weight={600} />
            <text x={x} y={y + r - 14} textAnchor="middle" fontSize={11} fill="var(--fg3)" style={{ pointerEvents: 'none' }}>
              {`${u.topics.length} topics`}
            </text>
          </g>
        );
      })}
    </Canvas>
  );
}

/* ---------- level 2: topics of a unit and how they connect ---------- */
function Topics({ c, u, go }: { c: Course; u: Unit; go: (p: Path) => void }) {
  const d = useLearner();
  // topics you keep getting wrong glow, so the weak spots show on the map itself
  const [weak, setWeak] = useState<Record<string, number>>({});
  useEffect(() => {
    api<{ topics: { id: string; weak: number; misses: number }[] }>(`/study/map?courseId=${c.id}`)
      .then((r) => setWeak(Object.fromEntries(r.topics.filter((t) => t.misses > 0 || t.weak >= 0.6).map((t) => [t.id, t.weak]))))
      .catch(() => undefined);
  }, [c.id]);
  const ids = u.topics;
  const edges = courseEdges(d, c).filter((e) => e.type !== 'rel' && edgeActive(e) && ids.includes(e.from) && ids.includes(e.to));
  const layer: Record<string, number> = {};
  const lay = (id: string, seen: string[] = []): number => {
    if (layer[id] !== undefined) return layer[id];
    if (seen.includes(id)) return 0;
    const ins = edges.filter((e) => e.to === id).map((e) => lay(e.from, [...seen, id]));
    return (layer[id] = ins.length ? Math.max(...ins) + 1 : 0);
  };
  ids.forEach((id) => lay(id));
  const cols = Math.max(0, ...Object.values(layer)) + 1;
  const byLayer: string[][] = Array.from({ length: cols }, () => []);
  ids.forEach((id) => byLayer[layer[id]].push(id));
  const NW = 200;
  const NH = 58;
  const gx = 90;
  const gy = 30;
  const width = Math.max(W, 60 + cols * NW + (cols - 1) * gx);
  const rowsMax = Math.max(...byLayer.map((l) => l.length));
  const height = Math.max(300, 60 + rowsMax * (NH + gy));
  const pos: Record<string, [number, number]> = {};
  byLayer.forEach((l, ci) =>
    l.forEach((id, ri) => {
      const colH = l.length * (NH + gy) - gy;
      pos[id] = [30 + ci * (NW + gx), (height - colH) / 2 + ri * (NH + gy)];
    }),
  );
  return (
    <Canvas label={`Topics in ${u.title}`} w={width} h={height}>
      {edges.map((e) => {
        const [x1, y1] = pos[e.from];
        const [x2, y2] = pos[e.to];
        const sx = x1 + NW;
        const sy = y1 + NH / 2;
        const ex = x2;
        const ey = y2 + NH / 2;
        const mx = (sx + ex) / 2;
        return <path key={e.key} d={`M${sx} ${sy} C${mx} ${sy} ${mx} ${ey} ${ex - 2} ${ey}`} fill="none" stroke="var(--fg3)" strokeWidth={1.8} markerEnd="url(#kg-arrow)" strokeDasharray={e.type === 'inf' ? '5 4' : '7 5'} className="kg-flow" />;
      })}
      {ids.map((id, i) => {
        const [x, y] = pos[id];
        const st = statusFor(d, id);
        const col = STATUS_COLOR[st];
        const est = masteryOf(d, id);
        return (
          <g key={id} className="kg-node kg-pop" style={{ animationDelay: `${i * 55}ms` }} tabIndex={0} role="button" aria-label={`${topicTitle(d, c, id)}, ${STATUS_LABEL[st]}`} onClick={() => go({ cid: c.id, uid: u.id, tid: id })} onKeyDown={(e) => e.key === 'Enter' && go({ cid: c.id, uid: u.id, tid: id })}>
            <rect x={x} y={y} width={NW} height={NH} rx={14} fill="var(--panel)" stroke={weak[id] >= 0.5 ? '#ff6b3d' : col} strokeWidth={2} filter="url(#kg-shadow)" style={weak[id] >= 0.5 ? { filter: `drop-shadow(0 0 ${6 + weak[id] * 12}px rgba(255,107,61,${0.45 + weak[id] * 0.45}))` } : undefined} />
            <rect x={x} y={y} width={7} height={NH} rx={3} fill={col} />
            <Label x={x + NW / 2 + 3} y={y + NH / 2 - 6} text={topicTitle(d, c, id)} size={12.5} max={24} lines={1} weight={600} />
            <text x={x + NW / 2 + 3} y={y + NH - 12} textAnchor="middle" fontSize={10.5} fill="var(--fg3)" style={{ pointerEvents: 'none' }}>
              {`${STATUS_LABEL[st]}${est.att ? ` · ${Math.round(est.est * 100)}%` : ''}`}
            </text>
          </g>
        );
      })}
    </Canvas>
  );
}

/* ---------- level 3: one topic, its relationships and its sub-topics ---------- */
function TopicDetail({ c, t, go }: { c: Course; t: Topic; go: (p: Path) => void }) {
  const d = useLearner();
  const edges = courseEdges(d, c).filter((e) => e.type !== 'rel' && e.status !== 'rejected');
  const pre = edges.filter((e) => e.to === t.id).map((e) => e.from);
  const post = edges.filter((e) => e.from === t.id).map((e) => e.to);
  const subs = subtopics(t).slice(0, 8);
  const cx = W / 2;
  const cy = 170;
  const side = (ids: string[], x: number, left: boolean) =>
    ids.slice(0, 5).map((id, i, a) => {
      const y = cy + (i - (a.length - 1) / 2) * 76;
      const unit = c.units.find((u) => u.topics.includes(id));
      return (
        <g key={id} className="kg-node" tabIndex={0} role="button" aria-label={topicTitle(d, c, id)} onClick={() => go({ cid: c.id, uid: unit?.id, tid: id })} onKeyDown={(e) => e.key === 'Enter' && go({ cid: c.id, uid: unit?.id, tid: id })}>
          <line x1={left ? x + 90 : cx + 120} y1={y} x2={left ? cx - 120 : x - 90} y2={cy} stroke="var(--fg3)" strokeWidth={1.6} markerEnd="url(#kg-arrow)" />
          <rect x={x - 90} y={y - 26} width={180} height={52} rx={13} fill="var(--panel)" stroke={STATUS_COLOR[statusFor(d, id)]} strokeWidth={2} />
          <Label x={x} y={y} text={topicTitle(d, c, id)} size={12} max={22} />
        </g>
      );
    });
  const sw = Math.min(150, (W - 80) / Math.max(1, subs.length) - 10);
  return (
    <Canvas label={`${t.title}: what it builds on, what it leads to, and its parts`} h={430}>
      <text x={110} y={34} fontSize={11.5} fill="var(--fg3)" fontFamily="var(--mono)">BUILDS ON</text>
      <text x={W - 110} y={34} textAnchor="end" fontSize={11.5} fill="var(--fg3)" fontFamily="var(--mono)">LEADS TO</text>
      {side(pre, 110, true)}
      {side(post, W - 110, false)}
      {!pre.length ? <text x={110} y={cy} fontSize={12} fill="var(--fg3)">Starting point</text> : null}
      {!post.length ? <text x={W - 110} y={cy} textAnchor="end" fontSize={12} fill="var(--fg3)">Nothing builds on it yet</text> : null}
      {subs.map((_, i) => {
        const x = 40 + sw / 2 + i * ((W - 80) / subs.length) + ((W - 80) / subs.length - sw) / 2;
        return <line key={`s${i}`} x1={cx} y1={cy + 38} x2={x} y2={330} stroke="var(--line2)" strokeWidth={1.4} />;
      })}
      <rect x={cx - 120} y={cy - 38} width={240} height={76} rx={18} filter="url(#kg-shadow)" fill={`color-mix(in srgb, ${STATUS_COLOR[statusFor(d, t.id)]} 12%, var(--panel))`} stroke={STATUS_COLOR[statusFor(d, t.id)]} strokeWidth={2.5} />
      <Label x={cx} y={cy} text={topicTitle(d, c, t.id)} size={15} max={22} lines={2} weight={600} />
      <text x={cx} y={316} textAnchor="middle" fontSize={11.5} fill="var(--fg3)" fontFamily="var(--mono)">
        INSIDE THIS TOPIC
      </text>
      {!subs.length ? (
        <g>
          <rect x={cx - 230} y={330} width={460} height={64} rx={13} fill="none" stroke="var(--line2)" strokeWidth={1.5} strokeDasharray="6 5" />
          <Label x={cx} y={362} text="Not written yet. Study this topic and its parts show up here." size={12.5} max={56} lines={2} fill="var(--fg3)" />
        </g>
      ) : null}
      {subs.map((s, i) => {
        const x = 40 + sw / 2 + i * ((W - 80) / subs.length) + ((W - 80) / subs.length - sw) / 2;
        return (
          <g key={i}>
            <rect x={x - sw / 2} y={330} width={sw} height={76} rx={13} fill="var(--panel2)" stroke="var(--line2)" strokeWidth={1.5} filter="url(#kg-shadow)" />
            <circle cx={x - sw / 2 + 14} cy={344} r={9} fill={UNIT_COLORS[i % UNIT_COLORS.length]} />
            <text x={x - sw / 2 + 14} y={348} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff" style={{ pointerEvents: 'none' }}>
              {i + 1}
            </text>
            <Label x={x} y={372} text={s} size={11.5} max={Math.max(12, Math.floor(sw / 7))} lines={4} fill="var(--fg2)" />
          </g>
        );
      })}
    </Canvas>
  );
}

function Details({ c, u, t }: { c: Course; u?: Unit; t?: Topic }) {
  const d = useLearner();
  const editGraph = useApp((s) => s.editGraph);
  if (t) {
    const m = masteryOf(d, t.id);
    const st = statusFor(d, t.id);
    const inferred = courseEdges(d, c).filter((e: Edge) => e.type === 'inf' && (e.from === t.id || e.to === t.id) && e.status !== 'rejected');
    return (
      <div className="card">
        <div className="hd">
          <h2>{topicTitle(d, c, t.id)}</h2>
          <span className="chip" style={{ borderColor: STATUS_COLOR[st] }}>{`${STATUS_LABEL[st]}${m.att ? ` · ${Math.round(m.est * 100)}%` : ''}`}</span>
        </div>
        {t.ai && t.summary ? <p className="body">{t.summary}</p> : <p className="small">The lesson for this topic is written the first time you study it. What is inside it will appear here.</p>}
        <div className="row wrap-r">
          <Link className="btn solid sm" href={`/app/courses/${c.id}/topics/${t.id}`}>
            Study this topic
          </Link>
          <Link className="btn sm" href={`/app/courses/${c.id}/practice?topic=${t.id}`}>
            Practise
          </Link>
          <Link className="btn sm" href={`/classroom/${c.id}/${t.id}`}>
            3D classroom
          </Link>
        </div>
        {inferred.length ? (
          <>
            <div className="label">Links we guessed from the order of your syllabus</div>
            <div className="list">
              {inferred.map((e) => (
                <div className="li" key={e.key}>
                  <div className="grow">
                    <div className="t">{`${topicTitle(d, c, e.from)} → ${topicTitle(d, c, e.to)}`}</div>
                    <div className="s">{e.status === 'accepted' ? 'Confirmed by you' : 'Guessed, not confirmed'}</div>
                  </div>
                  {e.status === 'accepted' ? null : (
                    <button className="btn xs" type="button" onClick={() => editGraph(c.id, (g) => void (!g.accepted.includes(e.key) && g.accepted.push(e.key)))}>
                      Confirm
                    </button>
                  )}
                  <button className="btn xs" type="button" onClick={() => editGraph(c.id, (g) => void (!g.rejected.includes(e.key) && g.rejected.push(e.key)))}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    );
  }
  if (u) {
    return (
      <div className="card">
        <h2>{u.title}</h2>
        <p className="small">Arrows point from a topic to the topics that build on it. Dashed arrows are links guessed from the order of your syllabus. Click a topic to see what it builds on and what is inside it.</p>
      </div>
    );
  }
  return null;
}

function legend() {
  return (
    <div className="legend" aria-label="Colour key">
      {(['mastered', 'learning', 'review', 'new'] as const).map((k) => (
        <span key={k}>
          <i style={{ background: STATUS_COLOR[k] }} />
          {STATUS_LABEL[k]}
        </span>
      ))}
    </div>
  );
}

/* ---------- the tree: everything opens in place as you click ---------- */
function TreeRing({ v, color, size = 34 }: { v: number; color: string; size?: number }) {
  return (
    <span className="kt-ring" style={{ width: size, height: size, background: `conic-gradient(${color} ${Math.round(v * 360)}deg, var(--line2) 0)` }} aria-hidden="true">
      <i />
    </span>
  );
}

function TreeNode({
  id,
  title,
  meta,
  value,
  color,
  open,
  onToggle,
  selected,
  level,
  children,
  hasKids,
}: {
  id: string;
  title: string;
  meta: string;
  value: number;
  color: string;
  open: boolean;
  onToggle: () => void;
  selected?: boolean;
  level: 0 | 1 | 2;
  hasKids: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className={`kt-li l${level}`}>
      <button type="button" className={`kt-card${selected ? ' sel' : ''}`} aria-expanded={hasKids ? open : undefined} aria-controls={`kt-${id}`} onClick={onToggle} style={{ '--kc': color } as React.CSSProperties}>
        <TreeRing v={value} color={color} size={level === 0 ? 40 : 34} />
        <span className="kt-tx">
          <b>{title}</b>
          <small>{meta}</small>
        </span>
        {hasKids ? (
          <span className={`kt-chev${open ? ' open' : ''}`} aria-hidden="true">
            ›
          </span>
        ) : null}
      </button>
      {hasKids ? (
        <div className={`kt-wrap${open ? ' open' : ''}`} id={`kt-${id}`}>
          <ul className="kt-kids">{children}</ul>
        </div>
      ) : null}
    </li>
  );
}

function KnowledgeTree({ cs }: { cs: Course[] }) {
  const d = useLearner();
  const [open, setOpen] = useState<Set<string>>(() => new Set(cs.length ? [cs[0].id] : []));
  const [sel, setSel] = useState<{ cid: string; uid: string; tid: string } | null>(null);
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const everything = useMemo(() => {
    const all: string[] = [];
    cs.forEach((c) => {
      all.push(c.id);
      c.units.forEach((u) => {
        all.push(`${c.id}/${u.id}`);
        u.topics.forEach((t) => all.push(`${c.id}/${u.id}/${t}`));
      });
    });
    return all;
  }, [cs]);
  const selC = sel ? cs.find((x) => x.id === sel.cid) : undefined;
  const selU = selC?.units.find((x) => x.id === sel?.uid);
  const selT = selC && sel ? selC.topics[sel.tid] : undefined;
  const dom = (k: string) => k.split('/').join('-');

  return (
    <>
      <div className="kt-tools">
        <button className="btn xs" type="button" onClick={() => setOpen(new Set(everything))}>
          Open all
        </button>
        <button className="btn xs" type="button" onClick={() => setOpen(new Set())}>
          Close all
        </button>
        <span className="small">Click a subject, unit or topic to open it.</span>
      </div>
      <ul className="kt kt-root">
        {cs.map((c, ci) => {
          const color = UNIT_COLORS[ci % UNIT_COLORS.length];
          return (
            <TreeNode key={c.id} id={c.id} level={0} title={c.title} meta={`${c.units.length} units · ${c.order.length} topics · ${Math.round(courseMastery(d, c) * 100)}% estimate`} value={courseMastery(d, c)} color={color} open={open.has(c.id)} hasKids onToggle={() => toggle(c.id)}>
              {c.units.map((u, ui) => {
                const uk = `${c.id}/${u.id}`;
                const est = u.topics.length ? u.topics.reduce((s, id) => s + masteryOf(d, id).est, 0) / u.topics.length : 0;
                const ucol = UNIT_COLORS[(ci + ui + 1) % UNIT_COLORS.length];
                return (
                  <TreeNode key={uk} id={dom(uk)} level={1} title={u.title} meta={`${u.topics.length} topics · ${Math.round(est * 100)}%`} value={est} color={ucol} open={open.has(uk)} hasKids={u.topics.length > 0} onToggle={() => toggle(uk)}>
                    {u.topics.map((tid) => {
                      const tk = `${uk}/${tid}`;
                      const t = c.topics[tid];
                      const st = statusFor(d, tid);
                      const parts = t ? subtopics(t) : [];
                      return (
                        <TreeNode
                          key={tk}
                          id={dom(tk)}
                          level={2}
                          title={topicTitle(d, c, tid)}
                          meta={STATUS_LABEL[st]}
                          value={masteryOf(d, tid).est}
                          color={STATUS_COLOR[st]}
                          open={open.has(tk)}
                          hasKids={parts.length > 0}
                          selected={sel?.tid === tid && sel.cid === c.id}
                          onToggle={() => {
                            setSel({ cid: c.id, uid: u.id, tid });
                            if (parts.length) toggle(tk);
                          }}
                        >
                          {parts.map((p, k) => (
                            <li key={k} className="kt-part">
                              <span>{k + 1}</span>
                              {p}
                            </li>
                          ))}
                        </TreeNode>
                      );
                    })}
                  </TreeNode>
                );
              })}
            </TreeNode>
          );
        })}
      </ul>
      {selC && selT ? <Details c={selC} u={selU} t={selT} /> : null}
    </>
  );
}

function KnowledgeMap({ start }: { start?: Path }) {
  const [mode, setMode] = useState<'tree' | 'map'>('tree');
  const cs = useCourses();
  const sp = useSearchParams();
  const [path, setPath] = useState<Path>(() => {
    const topic = sp.get('topic');
    if (start?.cid && topic) {
      const c = cs.find((x) => x.id === start.cid);
      const u = c?.units.find((x) => x.topics.includes(topic));
      if (c?.topics[topic]) return { cid: c.id, uid: u?.id, tid: topic };
    }
    return start ?? {};
  });
  const c = cs.find((x) => x.id === path.cid);
  const u = c?.units.find((x) => x.id === path.uid);
  const t = c && path.tid ? c.topics[path.tid] : undefined;
  const view = useMemo(() => (t ? 'topic' : u ? 'unit' : c ? 'subject' : 'all'), [t, u, c]);

  if (!cs.length)
    return (
      <div className="page">
        <div className="ph">
          <h1>Knowledge graph</h1>
        </div>
        <EmptyWorkspace />
      </div>
    );
  if (path.cid && !c) return <CourseMissing />;

  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Knowledge graph</div>
          <h1 style={{ marginTop: 8 }}>{t ? t.title : u ? u.title : c ? c.title : 'Your subjects'}</h1>
          <p className="sub">
            {view === 'all'
              ? 'Click a subject to see its units.'
              : view === 'subject'
                ? 'Click a unit to see its topics.'
                : view === 'unit'
                  ? 'Click a topic to see how it connects and what is inside it.'
                  : 'What this topic builds on, what builds on it, and the parts inside it.'}
          </p>
        </div>
      </div>
      <div className="kt-mode" role="tablist" aria-label="View">
        {(['tree', 'map'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            {m === 'tree' ? 'Tree' : 'Map'}
          </button>
        ))}
      </div>
      {mode === 'tree' ? <KnowledgeTree cs={cs} /> : null}
      {mode === 'map' ? <Crumbs path={path} cs={cs} c={c} u={u} t={t} go={setPath} /> : null}
      {mode === 'map' && view === 'all' ? <Subjects cs={cs} go={setPath} /> : null}
      {mode === 'map' && view === 'subject' && c ? <Units c={c} go={setPath} /> : null}
      {mode === 'map' && view === 'unit' && c && u ? <Topics c={c} u={u} go={setPath} /> : null}
      {mode === 'map' && view === 'topic' && c && t ? <TopicDetail c={c} t={t} go={setPath} /> : null}
      {legend()}
      {mode === 'map' && c ? <Details c={c} u={u} t={t} /> : null}
    </div>
  );
}

export function GraphIndexPage() {
  return <KnowledgeMap />;
}

export function GraphPage({ cid }: { cid: string }) {
  return <KnowledgeMap start={{ cid }} />;
}
