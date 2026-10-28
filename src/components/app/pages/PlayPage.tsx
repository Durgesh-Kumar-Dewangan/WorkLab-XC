'use client';

import { SyllabusFilterOptions } from '@/components/app/CurriculumFields';
import { curriculumLabel } from '@/lib/curricula';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon, Spinner } from '@/components/ui/Icon';
import { Segmented, Switch } from '@/components/ui/controls';
import { ShareCard } from '@/components/app/ShareCard';
import { PlayStrip } from '@/components/app/PlayStrip';
import { api, ApiFail } from '@/lib/api/client';
import { refreshPlay, usePlay } from '@/lib/play';
import { toast } from '@/lib/ui/toast';

interface League {
  week: string;
  top: {
    alias: string;
    xp: number;
    streak: number;
    you: boolean;
    level: number;
    education: string;
    category: string;
  }[];
  total: number;
  rank: number | null;
  yours: number;
  listed: boolean;
}
interface ShopItem {
  id: string;
  name: string;
  cost: number;
  note: string;
}

const LEARNERS = [
  ['', 'Everyone'],
  ['school', 'School'],
  ['college', 'College'],
  ['competitive', 'Competitive'],
  ['professional', 'Professional'],
  ['self', 'Self-study'],
] as const;
const label = (list: readonly (readonly [string, string])[], v: string) =>
  list.find((x) => x[0] === v)?.[1] ?? '';

const DAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dayLetter = (iso: string) => DAY[new Date(iso + 'T00:00:00Z').getUTCDay()];

/** The learner's own space: today's goal, the streak, the weekly league and what the gems buy. */
export function PlayPage() {
  const { me, reload } = usePlay();
  const [league, setLeague] = useState<League | null>(null);
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState('');
  const [scope, setScope] = useState<'week' | 'all'>('week');
  const [education, setEducation] = useState('');
  const [category, setCategory] = useState('');

  const loadLeague = useCallback(() => {
    const q = new URLSearchParams({ scope, education, category });
    api<League>(`/play/league?${q}`)
      .then(setLeague)
      .catch(() => undefined);
  }, [scope, education, category]);
  useEffect(loadLeague, [loadLeague]);
  useEffect(() => {
    api<{ items: ShopItem[] }>('/play/shop')
      .then((r) => setShop(r.items))
      .catch(() => undefined);
  }, [loadLeague]);
  useEffect(() => {
    if (me) setAlias(me.alias);
  }, [me]);

  const buy = async (id: string) => {
    setBusy(id);
    try {
      await api('/play/shop', { body: { item: id } });
      toast('Bought.', 'ok');
      refreshPlay();
      reload();
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    } finally {
      setBusy('');
    }
  };
  const save = async (body: { alias?: string; board?: boolean }) => {
    try {
      await api('/play/profile', { method: 'PUT', body });
      refreshPlay();
      loadLeague();
    } catch (e) {
      toast((e as ApiFail).message || 'That did not work.', 'err');
    }
  };

  if (!me)
    return (
      <div className="page">
        <Spinner size={20} />
      </div>
    );
  const pct = Math.min(100, Math.round((me.goal.today / me.goal.target) * 100));
  const toNext = Math.max(0, 60 * (me.level * me.level) - me.xp);
  return (
    <div className="page">
      <div className="ph">
        <div>
          <div className="label">Leaderboard</div>
          <h1 style={{ marginTop: 8 }}>
            Practise a little, <em>every day</em>
          </h1>
          <p className="sub">
            Right answers in a row double your points. Reach the daily goal to grow your streak, collect gems
            and climb this week’s league.
          </p>
        </div>
        <div className="acts">
          <Link className="btn solid" href="/app/learn?view=path">
            Start a round
          </Link>
        </div>
      </div>
      <PlayStrip className="pl-big" />

      <div className="pl-grid">
        <section className="card pl-today" aria-label="Today">
          <h2 className="h3">Today</h2>
          <div className="pl-goal">
            <div
              className="pl-ring"
              style={{ '--p': pct } as React.CSSProperties}
              role="img"
              aria-label={`${pct} percent of today's goal`}
            >
              <b>{me.goal.today}</b>
              <small>{`of ${me.goal.target}`}</small>
            </div>
            <div>
              <b>
                {me.goal.met
                  ? 'Daily goal reached'
                  : `${me.goal.target - me.goal.today} points to your daily goal`}
              </b>
              <p className="small">
                {me.streak
                  ? `${me.streak}-day streak. Your best is ${me.best}.`
                  : 'Reach the goal today to start a streak.'}
              </p>
              <p className="small">{`${me.freezes} streak freeze${me.freezes === 1 ? '' : 's'} held. A freeze covers one missed day.`}</p>
            </div>
          </div>
          <div className="pl-week" aria-label="This week">
            {me.week.map((d) => (
              <div
                key={d.day}
                className={d.xp >= me.goal.target ? 'on' : d.xp ? 'some' : ''}
                title={`${d.day}: ${d.xp} points`}
              >
                <i />
                <span>{dayLetter(d.day)}</span>
              </div>
            ))}
          </div>
          <p className="small">{`Level ${me.level}. ${toNext} more points to level ${me.level + 1}.`}</p>
        </section>

        <section className="card pl-league" aria-label="This week's league">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="h3">Leaderboard</h2>
            {league?.rank ? <span className="navtag">{`You are #${league.rank}`}</span> : null}
          </div>
          <Segmented<'week' | 'all'>
            ariaLabel="Period"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'week', label: 'This week' },
              { value: 'all', label: 'All time' },
            ]}
          />
          <div className="pl-filters">
            <label>
              <span className="label">Learner type</span>
              <select
                className="input"
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                aria-label="Learner type"
              >
                {LEARNERS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Syllabus</span>
              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Syllabus"
              >
                <SyllabusFilterOptions />
              </select>
            </label>
          </div>
          {league && league.top.length ? (
            <ol className="pl-board">
              {league.top.map((r, i) => (
                <li key={`${r.alias}-${i}`} className={r.you ? 'you' : ''}>
                  <span className="pl-pos">{i + 1}</span>
                  <span className="pl-name">
                    {r.alias}
                    {r.you ? ' (you)' : ''}
                  </span>
                  <small>
                    {[label(LEARNERS, r.education), curriculumLabel(r.category)]
                      .filter((x) => x && x !== 'Everyone' && x !== 'All syllabi')
                      .join(' · ') || `Lv ${r.level}`}
                  </small>
                  <b>{r.xp} XP</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="small">
              No one matches this filter yet. Answer a few practice questions to put yourself on the board.
            </p>
          )}
          <div className="pl-prof">
            <label className="field">
              <span className="label">Your league name (not your real name)</span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  value={alias}
                  maxLength={20}
                  onChange={(e) => setAlias(e.target.value)}
                />
                <button
                  className="btn xs"
                  type="button"
                  disabled={alias.trim() === me.alias}
                  onClick={() => void save({ alias: alias.trim() })}
                >
                  Save
                </button>
              </div>
            </label>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small">Show me on the league</span>
              <Switch
                checked={me.board}
                onChange={(v) => void save({ board: v })}
                label="Show me on the league"
              />
            </div>
          </div>
        </section>

        <section className="card pl-shop" aria-label="Gem shop">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="h3">Gem shop</h2>
            <span className="pl-chip gem">
              <i className="pl-gem" aria-hidden="true" /> {me.gems}
            </span>
          </div>
          <p className="small">
            A right answer is worth a gem, the daily goal is worth three more, and a perfect round three.
            Spend them here. Beta plans never run out of hearts.
          </p>
          <ul className="pl-items">
            {shop.map((s) => {
              const owned = s.id === 'chat' || s.id === 'notes' ? (me.bonus[s.id] ?? 0) : 0;
              return (
                <li key={s.id}>
                  <span className="grow">
                    <b>{s.name}</b>
                    <small>{s.note}</small>
                    {owned ? <small>{`You hold ${owned}.`}</small> : null}
                  </span>
                  <button
                    className="btn xs solid"
                    type="button"
                    disabled={
                      busy === s.id ||
                      me.gems < s.cost ||
                      (s.id === 'heart' && (me.hearts.unlimited || me.hearts.n >= me.hearts.max))
                    }
                    onClick={() => void buy(s.id)}
                  >
                    <i className="pl-gem" aria-hidden="true" /> {s.cost}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <ShareCard />
      <p className="small">
        <Icon name="info" size={13} /> Points, gems and hearts are worked out on the server from answers it
        marked, so they cannot be set from the browser.
      </p>
    </div>
  );
}
