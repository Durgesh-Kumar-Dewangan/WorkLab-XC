'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon, Spinner } from '@/components/ui/Icon';
import { AiGenAnimation } from '@/components/ui/AiGenAnimation';
import { api, ApiFail } from '@/lib/api/client';
import { toast } from '@/lib/ui/toast';
import { ago } from '@/lib/util';

interface Answer {
  title: string;
  summary: string;
  points: { label: string; text: string }[];
  diagram: { title: string; tiers: { label: string; tone: string }[][] } | null;
  table: { title: string; columns: string[]; rows: string[][] } | null;
  followups: string[];
  imagePrompt: string;
}
interface QNode {
  id: string;
  kind: 'question';
  x: number;
  y: number;
  parent: string | null;
  q: string;
  a: Answer | null;
  image: string | null;
  state: 'ready' | 'error' | 'pending';
  error?: string | null;
}
interface NoteNode {
  id: string;
  kind: 'note';
  x: number;
  y: number;
  parent: string | null;
  text: string;
  color: string;
}
type CNode = QNode | NoteNode;
interface Board {
  id: string;
  title: string;
  nodes: CNode[];
}
interface Summary {
  id: string;
  title: string;
  updated: number;
  count: number;
}

const W = 380;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const NOTE_COLORS = ['orange', 'yellow', 'green', 'blue', 'pink'];

/** The exploration canvas: ask a question, get an answer with visuals, branch from any idea, keep notes beside it. */
export function CanvasPage() {
  const q = useSearchParams();
  const id = q.get('c');
  return id ? <Board id={id} /> : <BoardList />;
}

function BoardList() {
  const router = useRouter();
  const [list, setList] = useState<Summary[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ canvases: Summary[] }>('/canvases')
      .then((r) => setList(r.canvases))
      .catch((e) => toast((e as ApiFail).message, 'err'));
  }, []);
  const make = async () => {
    setBusy(true);
    try {
      const r = await api<{ canvas: Board }>('/canvases', { body: {} });
      router.push(`/app/canvas?c=${r.canvas.id}`);
    } catch (e) {
      toast((e as ApiFail).message, 'err');
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Explore</div>
          <h1 style={{ marginTop: 8 }}>
            Keep related explorations <em>together</em>
          </h1>
          <p className="sub">Start with a question. Get an answer with visuals, not a wall of text. Branch from any idea, and keep your notes beside it.</p>
        </div>
        <div className="acts">
          <button className="btn solid" type="button" disabled={busy} onClick={() => void make()}>
            <Icon name="plus" size={15} /> New canvas
          </button>
        </div>
      </div>
      {list && !list.length ? (
        <div className="card cv-empty">
          <p>
            <b>What do you want to understand?</b>
          </p>
          <p className="small">Try “Why do habits compound over time?” or a topic from your syllabus. Each canvas holds the questions that belong together.</p>
          <button className="btn solid" type="button" disabled={busy} onClick={() => void make()}>
            Start a canvas
          </button>
        </div>
      ) : null}
      <div className="cv-grid">
        {list?.map((c) => (
          <Link key={c.id} href={`/app/canvas?c=${c.id}`} className="card cv-tile">
            <b>{c.title}</b>
            <span className="small">
              {c.count} {c.count === 1 ? 'card' : 'cards'} · {ago(c.updated)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Board({ id }: { id: string }) {
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [nodes, setNodes] = useState<CNode[]>([]);
  const [view, setView] = useState({ x: 40, y: 20, z: 1 });
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [visual, setVisual] = useState(true);
  const [busy, setBusy] = useState(false);
  const saveT = useRef(0);
  const dirty = useRef(false);
  const drag = useRef<{ kind: 'pan' | 'node'; id?: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ canvas: Board }>(`/canvases/${id}`)
      .then((r) => {
        setBoard(r.canvas);
        setNodes(r.canvas.nodes);
      })
      .catch((e) => {
        toast((e as ApiFail).message, 'err');
        router.replace('/app/canvas');
      });
  }, [id, router]);

  // save a moment after anything changes (positions, notes), never while an answer is still arriving
  const queueSave = useCallback(
    (next: CNode[]) => {
      dirty.current = true;
      window.clearTimeout(saveT.current);
      saveT.current = window.setTimeout(() => {
        const keep = next.filter((n) => n.kind === 'note' || (n.kind === 'question' && n.state !== 'pending'));
        api(`/canvases/${id}`, { method: 'PUT', body: { nodes: keep } })
          .then(() => (dirty.current = false))
          .catch(() => toast('Your last change could not be saved. Check your connection.', 'err'));
      }, 800);
    },
    [id],
  );
  const update = (fn: (n: CNode[]) => CNode[]) =>
    setNodes((cur) => {
      const next = fn(cur);
      queueSave(next);
      return next;
    });

  const onDown = (e: RPointerEvent, kind: 'pan' | 'node', nid?: string) => {
    const t = e.target as HTMLElement;
    if (t.closest('button, input, textarea, a, select')) return;
    const n = nid ? nodes.find((x) => x.id === nid) : undefined;
    drag.current = { kind, id: nid, sx: e.clientX, sy: e.clientY, ox: n ? n.x : view.x, oy: n ? n.y : view.y };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (kind === 'node' && nid) setSel(nid);
    if (kind === 'pan') setSel(null);
    e.stopPropagation();
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === 'pan') setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else setNodes((cur) => cur.map((n) => (n.id === d.id ? { ...n, x: d.ox + dx / view.z, y: d.oy + dy / view.z } : n)));
  };
  const onUp = () => {
    if (drag.current?.kind === 'node') queueSave(nodes);
    drag.current = null;
  };
  const zoomBy = (f: number) => setView((v) => ({ ...v, z: Math.max(0.35, Math.min(1.6, +(v.z * f).toFixed(3))) }));
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) setView((v) => ({ ...v, z: Math.max(0.35, Math.min(1.6, v.z * (e.deltaY < 0 ? 1.08 : 0.92))) }));
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [board]);

  const place = (parent: CNode | undefined) => {
    if (parent) {
      const kids = nodes.filter((n) => n.parent === parent.id).length;
      return { x: parent.x + W + 90, y: parent.y + kids * 320 };
    }
    const roots = nodes.filter((n) => !n.parent);
    const right = roots.reduce((m, n) => Math.max(m, n.x), -W - 90);
    return { x: roots.length ? right + W + 90 : 60, y: 60 };
  };

  const ask = async (question: string, parentId?: string | null) => {
    const qn = question.trim();
    if (qn.length < 2 || busy) return;
    const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
    const pos = place(parent);
    const temp: QNode = { id: `tmp-${uid()}`, kind: 'question', x: pos.x, y: pos.y, parent: parent?.id ?? null, q: qn, a: null, image: null, state: 'pending' };
    setNodes((cur) => [...cur, temp]);
    setBusy(true);
    setText('');
    try {
      const r = await api<{ node: QNode; imageSkipped: string | null }>(`/canvases/${id}/ask`, { body: { question: qn, parent: parent?.id, x: pos.x, y: pos.y, visual } });
      setNodes((cur) => cur.map((n) => (n.id === temp.id ? { ...r.node, state: 'ready' } : n)));
      setSel(r.node.id);
      if (visual && r.imageSkipped === 'plan') toast('Pictures are part of the Beta plan. You still get the full answer and the diagram.', 'info');
      else if (visual && r.imageSkipped === 'limit') toast('You have used today’s pictures. The answer is ready without one.', 'info');
      else if (visual && r.imageSkipped === 'busy') toast('The picture could not be drawn just now. The answer is ready.', 'info');
    } catch (e) {
      setNodes((cur) => cur.filter((n) => n.id !== temp.id));
      toast((e as ApiFail).message || 'That did not work. Try again.', 'err');
      setText(qn);
    } finally {
      setBusy(false);
    }
  };

  const addNote = () => {
    const base = sel ? nodes.find((n) => n.id === sel) : undefined;
    const n: NoteNode = { id: uid(), kind: 'note', x: base ? base.x + W + 90 : 80 - view.x / view.z, y: base ? base.y + 300 : 80 - view.y / view.z, parent: base?.id ?? null, text: '', color: 'orange' };
    update((cur) => [...cur, n]);
    setSel(n.id);
  };
  const remove = (nid: string) => update((cur) => cur.filter((n) => n.id !== nid).map((n) => (n.parent === nid ? { ...n, parent: null } : n)));
  const rename = async (title: string) => {
    if (!board || !title.trim() || title === board.title) return;
    setBoard({ ...board, title });
    api(`/canvases/${id}`, { method: 'PUT', body: { title, nodes: nodes.filter((n) => n.kind === 'note' || n.state !== 'pending') } }).catch(() => undefined);
  };

  if (!board)
    return (
      <div className="page">
        <Spinner size={20} />
      </div>
    );
  const selNode = nodes.find((n) => n.id === sel);
  const edges = nodes.filter((n) => n.parent).map((n) => ({ n, p: nodes.find((x) => x.id === n.parent) })).filter((e) => e.p);

  return (
    <div className="cv">
      <div className="cv-top">
        <Link href="/app/canvas" className="cv-chip">
          Canvas
        </Link>
        <input className="cv-title" defaultValue={board.title} aria-label="Canvas name" maxLength={80} onBlur={(e) => void rename(e.target.value)} />
      </div>

      <div className="cv-stage" ref={stage} onPointerDown={(e) => onDown(e, 'pan')} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="cv-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <svg className="cv-edges" width="1" height="1" overflow="visible" aria-hidden="true">
            {edges.map(({ n, p }) => {
              const x1 = p!.x + W;
              const y1 = p!.y + 56;
              const x2 = n.x;
              const y2 = n.y + 56;
              const mx = (x1 + x2) / 2;
              return <path key={n.id} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} />;
            })}
          </svg>
          {nodes.map((n) =>
            n.kind === 'note' ? (
              <div key={n.id} className={`cv-note c-${n.color}${sel === n.id ? ' sel' : ''}`} style={{ left: n.x, top: n.y }} onPointerDown={(e) => onDown(e, 'node', n.id)}>
                <div className="cv-nh">
                  <span>
                    <Icon name="file" size={15} /> Note
                  </span>
                  <span className="cv-nact">
                    {NOTE_COLORS.map((c) => (
                      <button key={c} type="button" className={`dot c-${c}`} aria-label={`${c} note`} onClick={() => update((cur) => cur.map((x) => (x.id === n.id ? { ...x, color: c } : x)))} />
                    ))}
                    <button type="button" aria-label="Delete note" onClick={() => remove(n.id)}>
                      ×
                    </button>
                  </span>
                </div>
                <textarea value={n.text} placeholder="Write a thought…" maxLength={600} onChange={(e) => update((cur) => cur.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)))} />
              </div>
            ) : (
              <QCard key={n.id} n={n} selected={sel === n.id} onDown={(e) => onDown(e, 'node', n.id)} onBranch={(question) => void ask(question, n.id)} onRemove={() => remove(n.id)} busy={busy} />
            ),
          )}
        </div>
      </div>

      <div className="cv-tools">
        <button type="button" className="icon-btn bordered" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>
          <Icon name="plus" size={16} />
        </button>
        <span>{Math.round(view.z * 100)}%</span>
        <button type="button" className="icon-btn bordered" aria-label="Zoom out" onClick={() => zoomBy(0.87)}>
          −
        </button>
        <button type="button" className="icon-btn bordered" aria-label="Reset the view" onClick={() => setView({ x: 40, y: 20, z: 1 })}>
          <Icon name="target" size={16} />
        </button>
      </div>

      <form
        className="cv-ask"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text, selNode?.kind === 'question' ? selNode.id : null);
        }}
      >
        {selNode?.kind === 'question' ? (
          <span className="cv-from">
            <Icon name="branch" size={13} /> Branching from “{selNode.q.slice(0, 40)}”
            <button type="button" aria-label="Stop branching" onClick={() => setSel(null)}>
              ×
            </button>
          </span>
        ) : null}
        <textarea
          value={text}
          rows={2}
          maxLength={300}
          placeholder="What do you want to understand?"
          aria-label="Your question"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(text, selNode?.kind === 'question' ? selNode.id : null);
            }
          }}
        />
        <div className="cv-row">
          <button type="button" className={`cv-pill${visual ? ' on' : ''}`} aria-pressed={visual} onClick={() => setVisual(!visual)}>
            <Icon name="image" size={14} /> {visual ? 'Picture on' : 'Picture off'}
          </button>
          <button type="button" className="cv-pill" onClick={addNote}>
            <Icon name="file" size={14} /> Add note
          </button>
          <span className="grow" />
          <button type="submit" className="cv-send" disabled={busy || text.trim().length < 2} aria-label="Ask">
            {busy ? <Spinner size={16} /> : '↑'}
          </button>
        </div>
      </form>
    </div>
  );
}

function QCard({ n, selected, onDown, onBranch, onRemove, busy }: { n: QNode; selected: boolean; onDown: (e: RPointerEvent) => void; onBranch: (q: string) => void; onRemove: () => void; busy: boolean }) {
  const a = n.a;
  return (
    <article className={`cv-card${selected ? ' sel' : ''}`} style={{ left: n.x, top: n.y, width: W }} onPointerDown={onDown}>
      <header>
        <h3>{n.q}</h3>
        <button type="button" aria-label="Remove this card" onClick={onRemove}>
          ×
        </button>
      </header>
      {n.state === 'pending' ? <AiGenAnimation title="Thinking" /> : null}
      {a ? (
        <>
          {n.image ? <img className="cv-img" src={`/api/canvas-image/${n.image}`} alt={a.imagePrompt || a.title} loading="lazy" /> : null}
          <p className="cv-sum">{a.summary}</p>
          {a.diagram ? (
            <div className="cv-diagram">
              <b>{a.diagram.title}</b>
              {a.diagram.tiers.map((t, i) => (
                <div key={i} className="cv-tier">
                  {t.map((b, j) => (
                    <span key={j} className={`tone-${b.tone}`}>
                      {b.label}
                    </span>
                  ))}
                  {i < a.diagram!.tiers.length - 1 ? <i aria-hidden="true">↓</i> : null}
                </div>
              ))}
            </div>
          ) : null}
          {a.table ? (
            <div className="cv-table">
              <b>{a.table.title}</b>
              <table>
                <thead>
                  <tr>
                    {a.table.columns.map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.table.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <ul className="cv-points">
            {a.points.map((p) => (
              <li key={p.label}>
                <button type="button" disabled={busy} title="Branch from this idea" onClick={() => onBranch(`Tell me more about ${p.label.toLowerCase()}: ${p.text}`.slice(0, 300))}>
                  <b>{p.label}</b> {p.text}
                  <Icon name="branch" size={13} />
                </button>
                <button
                  type="button"
                  className="cv-addcard"
                  title="Make a review card from this idea"
                  onClick={() =>
                    void api('/study/cards', { body: { front: `${a.title || n.q}: ${p.label}?`.slice(0, 400), back: p.text, title: a.title || n.q } })
                      .then(() => toast('Added to your review cards.', 'ok'))
                      .catch((e) => toast((e as ApiFail).message, 'err'))
                  }
                >
                  + card
                </button>
              </li>
            ))}
          </ul>
          {a.followups.length ? (
            <div className="cv-follow">
              {a.followups.map((f) => (
                <button key={f} type="button" disabled={busy} onClick={() => onBranch(f)}>
                  {f}
                </button>
              ))}
            </div>
          ) : null}
          <footer>
            <Icon name="branch" size={14} /> Branch from any useful idea
          </footer>
        </>
      ) : null}
    </article>
  );
}
