'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { topicTitle } from '@/lib/domain/courses';
import type { ClassroomController } from '@/lib/classroom/controller';
import type { McqQuestion, NumQuestion } from '@/lib/domain/types';
import { useApp } from '@/lib/store';

interface G {
  hearts: number;
  xp: number;
  streak: number;
  best: number;
  right: number;
  total: number;
}
type Phase = { k: 'start' } | { k: 'ask'; i: number } | { k: 'match' } | { k: 'end' };
const G0: G = { hearts: 3, xp: 0, streak: 0, best: 0, right: 0, total: 0 };
const TOTAL = 20;

function shuffled(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Concept Rush: a timed question round, then a match round. Pure revision, answers also feed the topic estimate. */
export function ConceptRush({ ctrl }: { ctrl: ClassroomController }) {
  const { tid, topic: t, course: c } = ctrl;
  const qs = useMemo(() => t.qs.filter((q) => q.type === 'mcq' || q.type === 'num'), [t]);
  const pairs = useMemo(
    () =>
      t.slides
        .filter((s) => s.b.length)
        .slice(0, 5)
        .map((s) => [s.t, s.b[0]] as const),
    [t],
  );
  const [phase, setPhase] = useState<Phase>({ k: 'start' });
  const [g, setG] = useState<G>(G0);
  const gRef = useRef(g);
  gRef.current = g;
  const [pops, setPops] = useState<{ id: number; txt: string; good: boolean }[]>([]);
  const [end, setEnd] = useState<{ stars: number; rec: boolean } | null>(null);
  const popId = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => ctrl.closeGame(), [ctrl]);

  useEffect(() => {
    root.current?.querySelector<HTMLElement>('.btn.solid')?.focus();
  }, []);

  const pop = (txt: string, good: boolean) => {
    const id = ++popId.current;
    setPops((p) => [...p, { id, txt, good }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 900);
  };
  const gain = (ok: boolean, fast: boolean) => {
    const cur = gRef.current;
    let n: G;
    if (ok) {
      const streak = cur.streak + 1;
      const add = 10 + Math.min(streak - 1, 4) * 5 + (fast ? 5 : 0);
      n = {
        ...cur,
        total: cur.total + 1,
        right: cur.right + 1,
        streak,
        best: Math.max(cur.best, streak),
        xp: cur.xp + add,
      };
      pop(`+${add}`, true);
    } else {
      n = { ...cur, total: cur.total + 1, streak: 0, hearts: cur.hearts - 1 };
      pop('−♥', false);
    }
    gRef.current = n;
    setG(n);
  };
  const finish = () => {
    const cur = gRef.current;
    const ratio = cur.right / Math.max(1, cur.total);
    const stars = cur.hearts <= 0 ? 0 : ratio > 0.8 && cur.hearts === 3 ? 3 : ratio > 0.5 ? 2 : 1;
    const app = useApp.getState();
    const pb = app.gameBest[tid];
    const rec = !pb || cur.xp > pb.xp;
    if (rec) app.setGameBest(tid, { xp: cur.xp, stars });
    app.logActivity(
      'game',
      `Played Concept Rush on ${topicTitle(app, c, tid)}: ${cur.xp} XP`,
      `/classroom/${c.id}/${tid}`,
      c.id,
    );
    setEnd({ stars, rec });
    setPhase({ k: 'end' });
  };
  const afterAsk = (i: number) => {
    if (gRef.current.hearts <= 0) return finish();
    if (i + 1 >= qs.length) return pairs.length >= 2 ? setPhase({ k: 'match' }) : finish();
    setPhase({ k: 'ask', i: i + 1 });
  };
  const label =
    phase.k === 'ask'
      ? `Round 1 · ${phase.i + 1}/${qs.length}`
      : phase.k === 'match'
        ? 'Round 2 · Match'
        : phase.k === 'end'
          ? 'Done'
          : 'Round 1';

  return (
    <div
      className="gm"
      role="dialog"
      aria-modal="true"
      aria-label="Revision game"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="gm-hud">
        <span className="gm-hearts" aria-label={`${g.hearts} lives`}>
          {'♥'.repeat(Math.max(0, g.hearts)) + '♡'.repeat(3 - Math.max(0, g.hearts))}
        </span>
        <span className="gm-lab">{label}</span>
        <span className="gm-xp num">{`${g.xp} XP${g.streak > 1 ? ` · 🔥${g.streak}` : ''}`}</span>
        <button className="icon-btn bordered" type="button" aria-label="Close game" onClick={close}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="gm-body">
        {phase.k === 'start' ? (
          <div className="gm-card gm-start">
            <div className="gm-hearts big">♥ ♥ ♥</div>
            <h2 className="h2">Concept Rush</h2>
            <ul className="gm-rules">
              <li>
                <Icon name="target" size={16} />
                Answer before the bar runs out
              </li>
              <li>
                <span>🔥</span>Streaks give bonus XP
              </li>
              <li>
                <span>♥</span>A wrong answer costs a heart
              </li>
            </ul>
            <button
              className="btn solid lg"
              type="button"
              onClick={() => setPhase(qs.length ? { k: 'ask', i: 0 } : { k: 'match' })}
            >
              <Icon name="play" size={16} />
              Start
            </button>
          </div>
        ) : null}
        {phase.k === 'ask' ? (
          <AskStep
            key={phase.i}
            x={qs[phase.i] as McqQuestion | NumQuestion}
            tid={tid}
            lastLife={g.hearts <= 1}
            onResult={gain}
            onNext={() => afterAsk(phase.i)}
          />
        ) : null}
        {phase.k === 'match' ? (
          <MatchRound
            pairs={pairs}
            onRight={() => gain(true, false)}
            onWrong={() => gain(false, false)}
            hearts={() => gRef.current.hearts}
            onDone={finish}
          />
        ) : null}
        {phase.k === 'end' && end ? (
          <div className="gm-card gm-end">
            <div className="gm-stars">
              {[0, 1, 2].map((k) => (
                <span
                  key={k}
                  className={k < end.stars ? 'on' : ''}
                  style={{ animationDelay: `${k * 0.15}s` }}
                >
                  ★
                </span>
              ))}
            </div>
            <h2 className="h2">
              {g.hearts <= 0 ? 'Out of hearts' : end.stars === 3 ? 'Perfect run' : 'Nice work'}
            </h2>
            <div className="gm-stats">
              <div>
                <b className="num">{g.xp}</b>
                <span>XP</span>
              </div>
              <div>
                <b className="num">{`${g.right}/${g.total}`}</b>
                <span>Right</span>
              </div>
              <div>
                <b className="num">{g.best}</b>
                <span>Best streak</span>
              </div>
            </div>
            {end.rec ? <p className="small">New personal best.</p> : null}
            <div className="row wrap-r">
              <button
                className="btn solid lg"
                type="button"
                onClick={() => {
                  setG(G0);
                  gRef.current = G0;
                  setEnd(null);
                  setPhase({ k: 'start' });
                }}
              >
                <Icon name="replay" size={16} />
                Play again
              </button>
              <button
                className="btn lg"
                type="button"
                onClick={() => {
                  close();
                  ctrl.seek(0);
                }}
              >
                Review the lesson
              </button>
              <button className="btn ghost" type="button" onClick={close}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {pops.map((p) => (
        <div key={p.id} className={clsx('gm-pop', p.good ? 'g' : 'b')}>
          {p.txt}
        </div>
      ))}
    </div>
  );
}

function AskStep({
  x,
  tid,
  lastLife,
  onResult,
  onNext,
}: {
  x: McqQuestion | NumQuestion;
  tid: string;
  lastLife: boolean;
  onResult: (ok: boolean, fast: boolean) => void;
  onNext: () => void;
}) {
  const [left, setLeft] = useState(TOTAL);
  const leftRef = useRef(TOTAL);
  const [done, setDone] = useState<{ ok: boolean; msg: string; picked?: number } | null>(null);
  const [num, setNum] = useState('');
  const order = useMemo(() => (x.type === 'mcq' ? shuffled(x.opts.length) : []), [x]);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const inp = useRef<HTMLInputElement>(null);

  const fin = useCallback(
    (ok: boolean, msg: string, picked?: number) => {
      if (locked.current) return;
      locked.current = true;
      clearInterval(timer.current);
      onResult(ok, leftRef.current > TOTAL * 0.6);
      useApp.getState().recordAnswer(tid, ok);
      setDone({ ok, msg: `${msg} ${x.why || ''}`.trim(), picked });
    },
    [onResult, tid, x.why],
  );

  useEffect(() => {
    timer.current = setInterval(() => {
      leftRef.current = Math.max(0, leftRef.current - 0.1);
      setLeft(leftRef.current);
      if (leftRef.current <= 0) fin(false, 'Time is up.');
    }, 100);
    if (x.type === 'num') setTimeout(() => inp.current?.focus(), 50);
    return () => clearInterval(timer.current);
  }, [fin, x.type]);

  const submitNum = () => {
    if (x.type !== 'num') return;
    const v = parseFloat(num.replace(',', '.'));
    if (!Number.isFinite(v)) return inp.current?.focus();
    const ok = Math.abs(v - x.ans) <= Math.max(x.tol, Math.abs(x.ans) * 0.02);
    fin(ok, ok ? 'Correct!' : `The answer is ${x.ans}${x.unit ? ` ${x.unit}` : ''}.`);
  };

  return (
    <div className="gm-card">
      <div className="gm-time" aria-hidden="true">
        <i style={{ width: `${Math.max(0, (left / TOTAL) * 100)}%` }} />
      </div>
      <p className="gm-q">{x.q}</p>
      {x.type === 'mcq' ? (
        <div className="gm-opts">
          {order.map((k, n) => {
            const reveal = done && (k === x.ans || done.picked === k);
            return (
              <button
                key={k}
                type="button"
                className={clsx('gm-opt', reveal && (k === x.ans ? 'okc' : 'badc'))}
                disabled={!!done}
                onClick={() => fin(k === x.ans, k === x.ans ? 'Correct!' : 'Not quite.', k)}
              >
                <b>{String.fromCharCode(65 + n)}</b>
                {x.opts[k]}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="row">
          <input
            ref={inp}
            className="input"
            inputMode="decimal"
            placeholder={`Number${'unit' in x && x.unit ? ` (${x.unit})` : ''}`}
            aria-label="Answer"
            disabled={!!done}
            value={num}
            onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitNum()}
          />
          <button className="btn solid" type="button" disabled={!!done} onClick={submitNum}>
            Check
          </button>
        </div>
      )}
      {done ? (
        <>
          <div className={clsx('callout', !done.ok && 'warn')}>
            <Icon name={done.ok ? 'check' : 'info'} size={16} />
            <span>{done.msg}</span>
          </div>
          <button className="btn solid" type="button" autoFocus onClick={onNext}>
            {lastLife && !done.ok ? 'See result' : 'Next'}
          </button>
        </>
      ) : null}
    </div>
  );
}

function MatchRound({
  pairs,
  onRight,
  onWrong,
  hearts,
  onDone,
}: {
  pairs: readonly (readonly [string, string])[];
  onRight: () => void;
  onWrong: () => void;
  hearts: () => number;
  onDone: () => void;
}) {
  const L = useMemo(() => shuffled(pairs.length), [pairs]);
  const R = useMemo(() => shuffled(pairs.length), [pairs]);
  const [pick, setPick] = useState<{ side: 0 | 1; i: number } | null>(null);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [shake, setShake] = useState<string[]>([]);
  const key = (side: 0 | 1, i: number) => `${side}:${i}`;

  if (pairs.length < 2) {
    return (
      <div className="gm-card">
        <p className="body">This lesson has too few ideas for a match round.</p>
        <button className="btn solid" type="button" onClick={onDone}>
          See result
        </button>
      </div>
    );
  }

  const click = (side: 0 | 1, i: number) => {
    if (done.has(key(side, i))) return;
    if (!pick) return setPick({ side, i });
    if (pick.side === side) return setPick(pick.i === i ? null : { side, i });
    const a = pick;
    setPick(null);
    if (a.i === i) {
      const nd = new Set(done).add(key(a.side, a.i)).add(key(side, i));
      setDone(nd);
      onRight();
      if (nd.size >= pairs.length * 2) setTimeout(onDone, 700);
    } else {
      const ks = [key(a.side, a.i), key(side, i)];
      setShake(ks);
      onWrong();
      setTimeout(() => {
        setShake([]);
        if (hearts() <= 0) onDone();
      }, 450);
    }
  };
  const tile = (side: 0 | 1, i: number) => (
    <button
      key={key(side, i)}
      type="button"
      className={clsx(
        'gm-tile',
        pick?.side === side && pick.i === i && 'sel',
        done.has(key(side, i)) && 'done',
        shake.includes(key(side, i)) && 'shake',
      )}
      onClick={() => click(side, i)}
    >
      {side === 0 ? pairs[i][0] : pairs[i][1]}
    </button>
  );
  return (
    <div className="gm-card">
      <span className="label">Match each slide title to its key idea</span>
      <div className="gm-match">
        <div>{L.map((i) => tile(0, i))}</div>
        <div>{R.map((i) => tile(1, i))}</div>
      </div>
    </div>
  );
}
