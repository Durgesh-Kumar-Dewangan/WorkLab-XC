'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { LimitNotice } from '@/components/app/LimitNotice';
import { Heart, PlayStrip } from '@/components/app/PlayStrip';
import { Icon, Spinner } from '@/components/ui/Icon';
import { api, ApiFail } from '@/lib/api/client';
import { comboValue, refreshPlay, usePlay, type Reward } from '@/lib/play';
import { toast } from '@/lib/ui/toast';

interface Card {
  type: 'mcq' | 'blank' | 'tf';
  prompt: string;
  options: string[];
}
interface Verdict {
  ok: boolean;
  answer: number;
  why: string;
  reward?: Reward;
}
interface Result {
  card: Card;
  choice: number;
  ok: boolean;
  right: string;
  why: string;
}
interface Finish {
  bonusXp: number;
  gems: number;
  perfect: boolean;
}

const SECONDS = 20;
const LETTERS = ['A', 'B', 'C', 'D', 'E'];

/** The card's sentence with the blank shown as a box that fills in with the chosen word. */
function Prompt({ card, picked }: { card: Card; picked: number | null }) {
  if (card.type !== 'blank') return <h2 className="dr-q">{card.prompt}</h2>;
  const [a, ...rest] = card.prompt.split('____');
  return (
    <h2 className="dr-q">
      {a}
      <span className={clsx('dr-blank', picked !== null && 'on')}>{picked !== null ? card.options[picked] : ''}</span>
      {rest.join('____')}
    </h2>
  );
}

const wait = (at: number | null) => {
  if (!at) return '';
  const m = Math.max(1, Math.ceil((at - Date.now()) / 60000));
  return `${m} minute${m === 1 ? '' : 's'}`;
};

/**
 * A practice round, laid out like a language-learning app: one card at a time, a progress bar with your hearts, a green or red
 * answer sheet at the bottom, and points that double with each right answer in a row. Cards are written instantly from the
 * topic's lesson; every answer is marked on the server, which also works out the points, hearts and gems. The colours come from the
 * chosen theme.
 */
export function DrillPlayer({ title, onClose }: { title: string; onClose?: () => void }) {
  const { me } = usePlay();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [err, setErr] = useState<ApiFail | null>(null);
  const [loading, setLoading] = useState(false);
  const [timed, setTimed] = useState(false);
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(SECONDS);
  const [results, setResults] = useState<Result[]>([]);
  const [xp, setXp] = useState(0);
  const [combo, setCombo] = useState(0);
  const [hearts, setHearts] = useState<number | null>(null);
  const [broke, setBroke] = useState(false);
  const [finish, setFinish] = useState<Finish | null>(null);
  const [gems, setGems] = useState(0);
  const t0 = useRef(0);
  const [took, setTook] = useState(0);

  const load = useCallback(
    async (fresh = false) => {
      setLoading(true);
      setErr(null);
      try {
        const r = await api<{ cards: Card[] }>('/learn/drill', { body: { title, fresh } });
        setCards(r.cards);
      } catch (e) {
        setErr(e as ApiFail);
      } finally {
        setLoading(false);
      }
    },
    [title],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const card = cards?.[i];
  const done = !!cards && started && i >= cards.length;
  const unlimited = !!me?.hearts.unlimited;
  const shownHearts = hearts ?? me?.hearts.n ?? 5;
  const out = !unlimited && me != null && shownHearts <= 0;

  const submit = useCallback(
    async (choice: number, timedOut = false) => {
      if (!card || verdict || busy) return;
      setBusy(true);
      try {
        const v = await api<Verdict>('/learn/drill', { method: 'PUT', body: { title, index: i, choice: timedOut ? 6 : choice } });
        setVerdict(v);
        const r = v.reward;
        setXp((x) => x + (r?.xp ?? 0));
        setGems((g) => g + (r?.gems ?? 0));
        setCombo(r?.combo ?? (v.ok ? combo + 1 : 0));
        if (r?.hearts !== undefined) setHearts(r.hearts);
        if (r?.outOfHearts) setBroke(true);
        setResults((rs) => [...rs, { card, choice: timedOut ? -1 : choice, ok: v.ok, right: card.options[v.answer], why: v.why }]);
        refreshPlay();
      } catch (e) {
        setErr(e as ApiFail);
      } finally {
        setBusy(false);
      }
    },
    [card, verdict, busy, title, i, combo],
  );

  // the clock for a timed round
  useEffect(() => {
    if (!timed || !started || !card || verdict || done) return;
    setLeft(SECONDS);
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [timed, started, i, card, verdict, done]);
  useEffect(() => {
    if (timed && started && card && !verdict && left <= 0) void submit(0, true);
  }, [left, timed, started, card, verdict, submit]);

  const finishRound = useCallback(
    async (rs: Result[]) => {
      setTook(Math.round((Date.now() - t0.current) / 1000));
      try {
        const r = await api<{ round: Finish }>('/play/round', { body: { correct: rs.filter((x) => x.ok).length, total: rs.length } });
        setFinish(r.round);
        setXp((x) => x + r.round.bonusXp);
        setGems((g) => g + r.round.gems);
        refreshPlay();
      } catch {
        /* the round still counts; only the bonus is missed */
      }
    },
    [],
  );

  const next = () => {
    setVerdict(null);
    setPicked(null);
    if (broke) return; // the hearts screen takes over
    const n = i + 1;
    setI(n);
    if (cards && n >= cards.length) void finishRound(results);
  };
  const begin = () => {
    t0.current = Date.now();
    setStarted(true);
    setI(0);
    setResults([]);
    setXp(0);
    setGems(0);
    setCombo(0);
    setVerdict(null);
    setPicked(null);
    setBroke(false);
    setFinish(null);
  };
  const again = async (fresh: boolean) => {
    setStarted(false);
    setI(0);
    if (fresh) await load(true);
    else begin();
  };
  const refill = async () => {
    try {
      await api('/play/shop', { body: { item: 'heart' } });
      setBroke(false);
      setHearts(me?.hearts.max ?? 5);
      refreshPlay();
      toast('Hearts refilled.', 'ok');
    } catch (e) {
      toast((e as ApiFail).message || 'Not enough gems yet.', 'err');
    }
  };

  const right = results.filter((r) => r.ok).length;
  const pct = cards ? Math.round((Math.min(i, cards.length) / cards.length) * 100) : 0;
  const weak = useMemo(() => results.filter((r) => !r.ok), [results]);

  if (err && !cards) return <LimitNotice error={err} onRetry={() => void load()} />;
  if (loading || !cards)
    return (
      <div className="dr dr-center" role="status">
        <Spinner size={22} />
        <p className="body">Writing your practice round…</p>
      </div>
    );

  // out of hearts: before a round, or in the middle of one
  if (out || (broke && !verdict))
    return (
      <div className="dr dr-center dr-empty">
        <span className="dr-ic">
          <Heart full={false} />
        </span>
        <h2 className="h3">You are out of hearts</h2>
        <p className="body">Hearts keep a round honest: a wrong answer costs one. They come back by themselves, one every 25 minutes{me?.hearts.nextAt ? ` (the next in about ${wait(me.hearts.nextAt)})` : ''}, or you can refill them with gems. Beta plans never run out.</p>
        <p className="small">Meanwhile, the lesson, the game and the tutor are all open.</p>
        <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn solid" type="button" disabled={(me?.gems ?? 0) < 10} onClick={() => void refill()}>
            <i className="pl-gem" aria-hidden="true" /> Refill for 10 gems {me ? `(you have ${me.gems})` : ''}
          </button>
          {onClose ? (
            <button className="btn" type="button" onClick={onClose}>
              Back to the lesson
            </button>
          ) : null}
        </div>
      </div>
    );

  if (!started)
    return (
      <div className="dr dr-center">
        <PlayStrip />
        <span className="dr-ic">
          <Icon name="target" size={26} />
        </span>
        <h2 className="h3">Practice round</h2>
        <p className="body">{`${cards.length} quick cards on ${title}: multiple choice, fill in the blank and true or false. Each right answer in a row doubles its points.`}</p>
        <div className="dr-ladder" aria-label="Points for answers in a row">
          {[0, 1, 2, 3, 4].map((c) => (
            <span key={c}>{comboValue(c)}</span>
          ))}
        </div>
        <label className="check dr-timed">
          <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
          <span>Timed round: {SECONDS} seconds a card</span>
        </label>
        <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
          <button className="btn solid lg" type="button" onClick={begin}>
            Start
          </button>
          {onClose ? (
            <button className="btn lg" type="button" onClick={onClose}>
              Not now
            </button>
          ) : null}
        </div>
      </div>
    );

  if (done)
    return (
      <div className="dr dr-end">
        <span className="dr-ic ok">
          <Icon name="award" size={28} />
        </span>
        <h2 className="h3">{right === cards.length ? 'Perfect round' : right >= cards.length * 0.7 ? 'Nicely done' : 'Good practice'}</h2>
        <div className="dr-stats">
          <div>
            <b>{`${right}/${cards.length}`}</b>
            <span>correct</span>
          </div>
          <div>
            <b>{xp}</b>
            <span>points</span>
          </div>
          <div>
            <b>{gems}</b>
            <span>gems</span>
          </div>
          <div>
            <b>{`${Math.floor(took / 60)}:${String(took % 60).padStart(2, '0')}`}</b>
            <span>time</span>
          </div>
        </div>
        {finish?.perfect ? <p className="dr-bonus">Perfect round bonus: +{finish.bonusXp} points and {finish.gems} gems</p> : finish?.bonusXp ? <p className="dr-bonus">Finished: +{finish.bonusXp} bonus points</p> : null}
        <PlayStrip />
        {weak.length ? (
          <div className="dr-review">
            <h3>Worth another look</h3>
            {weak.map((w, k) => (
              <div key={k} className="dr-rev">
                <b>{w.card.prompt.replace('____', w.right)}</b>
                <span>{w.why}</span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="small">Every answer updates your estimate for this topic. It is only an estimate. Wrong answers also become review cards in the Study coach.</p>
        <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn solid" type="button" onClick={() => void again(false)}>
            Practise again
          </button>
          <button className="btn" type="button" onClick={() => void again(true)}>
            New round
          </button>
          {onClose ? (
            <button className="btn" type="button" onClick={onClose}>
              Done
            </button>
          ) : null}
        </div>
      </div>
    );

  const reward = verdict?.reward;
  return (
    <div className="dr dr-duo">
      <div className="dr-top">
        {onClose ? (
          <button className="dr-x" type="button" aria-label="Leave the round" onClick={onClose}>
            ×
          </button>
        ) : null}
        <div className="dr-prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Round progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        <span className="dr-hearts" aria-label={unlimited ? 'Unlimited hearts' : `${shownHearts} hearts left`}>
          <Heart full /> {unlimited ? '∞' : shownHearts}
        </span>
        {timed ? <span className={clsx('dr-clock', left <= 5 && 'low')}>{Math.max(0, left)}s</span> : null}
      </div>
      <div className="dr-meta">
        <span className="dr-xp">{`${xp} XP`}</span>
        {combo >= 1 ? <span className="dr-combo">{`${combo} in a row · next right answer is worth ${comboValue(combo)}`}</span> : <span className="small">{`Right answer: ${comboValue(0)} points`}</span>}
      </div>
      {err ? <LimitNotice error={err} /> : null}
      <div className="dr-card">
        <span className="dr-chip">{`${i + 1} of ${cards.length} · ${title}`}</span>
        <Prompt card={card!} picked={picked} />
        <div className="dr-opts" role="radiogroup" aria-label="Answers">
          {card!.options.map((o, k) => {
            const state = verdict ? (k === verdict.answer ? 'right' : k === picked ? 'wrong' : '') : picked === k ? 'pick' : '';
            return (
              <button key={k} type="button" role="radio" aria-checked={picked === k} disabled={!!verdict} className={clsx('dr-opt', state)} onClick={() => setPicked(k)}>
                <span>{LETTERS[k]}</span>
                {o}
              </button>
            );
          })}
        </div>
      </div>
      <div className={clsx('dr-foot', verdict && (verdict.ok ? 'ok' : 'no'))} role="status">
        {verdict ? (
          <div className="dr-fb">
            <b>{verdict.ok ? (reward?.multiplier && reward.multiplier > 1 ? `Correct · ×${reward.multiplier}` : 'Correct') : picked === null ? 'Out of time' : 'Not quite'}</b>
            <span>{verdict.why}</span>
            {reward?.xp ? (
              <span className="dr-gain">
                +{reward.xp} XP{reward.gems ? ` · +${reward.gems} gem${reward.gems === 1 ? '' : 's'}` : ''}
                {reward.goalHit ? ' · daily goal reached, streak ' + reward.streak : ''}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="small">Pick an answer, then check it.</span>
        )}
        {verdict ? (
          <button className={clsx('btn lg dr-go', verdict.ok ? 'solid' : 'danger')} type="button" onClick={next} autoFocus>
            {i + 1 >= cards.length ? 'See results' : 'Continue'}
          </button>
        ) : (
          <button className="btn solid lg dr-go" type="button" disabled={picked === null || busy} onClick={() => picked !== null && void submit(picked)}>
            {busy ? <Spinner size={14} /> : null} Check
          </button>
        )}
      </div>
    </div>
  );
}
