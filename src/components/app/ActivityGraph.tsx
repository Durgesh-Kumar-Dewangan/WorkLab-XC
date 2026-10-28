'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { useApp } from '@/lib/store';
import { dayKey } from '@/lib/util';

interface ServerDay {
  day: string;
  events: number;
  answered: number;
  correct: number;
  sessions: number;
  minutes?: number;
}
interface Cell {
  key: string;
  date: Date;
  score: number;
  answered: number;
  minutes: number;
  sessions: number;
  future: boolean;
}

const WEEKS = 53;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const level = (s: number) => (s <= 0 ? 0 : s <= 2 ? 1 : s <= 5 ? 2 : s <= 9 ? 3 : 4);

/** The learner's activity from the server (answers, sessions), loaded once. */
export function useActivity() {
  const [days, setDays] = useState<ServerDay[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ days: ServerDay[] }>('/learn/activity')
      .then((r) => alive && setDays(r.days))
      .catch(() => alive && setDays([]));
    return () => {
      alive = false;
    };
  }, []);
  return days;
}

/**
 * A GitHub-style activity graph: one square per day for the last year, darker for busier days. A day's weight is its
 * answers and sessions from the server plus its study time from this device (one point per five minutes).
 */
export function ActivityGraph({ days }: { days: ServerDay[] | null }) {
  const minutes = useApp((s) => s.minutes);
  const scroller = useRef<HTMLDivElement>(null);

  const { weeks, stats, monthLabels } = useMemo(() => {
    const byDay = new Map((days ?? []).map((d) => [d.day, d]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - ((WEEKS - 1) * 7 + today.getDay()));
    const weeks: Cell[][] = [];
    const flat: Cell[] = [];
    for (let w = 0; w < WEEKS; w++) {
      const col: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const key = dayKey(date);
        const s = byDay.get(key);
        const min = Math.max(minutes[key] || 0, s?.minutes ?? 0);
        const cell: Cell = {
          key,
          date,
          score: (s ? s.answered + s.sessions : 0) + Math.round(min / 5),
          answered: s?.answered ?? 0,
          minutes: Math.round(min),
          sessions: s?.sessions ?? 0,
          future: date > today,
        };
        col.push(cell);
        if (!cell.future) flat.push(cell);
      }
      weeks.push(col);
    }
    const active = flat.filter((c) => c.score > 0);
    let longest = 0;
    let run = 0;
    flat.forEach((c) => {
      run = c.score > 0 ? run + 1 : 0;
      longest = Math.max(longest, run);
    });
    let current = 0;
    for (let i = flat.length - 1; i >= 0; i--) {
      if (flat[i].score > 0) current++;
      else if (i === flat.length - 1) continue;
      else break;
    }
    const best = flat.reduce((m, c) => (c.score > m.score ? c : m), flat[0]);
    const monthLabels = weeks.map((col, i) => {
      const m = col[0].date.getMonth();
      return i === 0 || m !== weeks[i - 1][0].date.getMonth() ? MONTHS[m] : '';
    });
    return {
      weeks,
      monthLabels,
      stats: {
        total: flat.reduce((s, c) => s + c.score, 0),
        activeDays: active.length,
        longest,
        current,
        answers: flat.reduce((s, c) => s + c.answered, 0),
        best: best && best.score > 0 ? best : null,
      },
    };
  }, [days, minutes]);

  // show the most recent weeks first on a narrow screen
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  return (
    <div className="hm-wrap">
      <div className="hm-stats">
        <div>
          <b className="num">{stats.total}</b>
          <span>activity points, last year</span>
        </div>
        <div>
          <b className="num">{stats.activeDays}</b>
          <span>active days</span>
        </div>
        <div>
          <b className="num">{stats.current}</b>
          <span>day streak</span>
        </div>
        <div>
          <b className="num">{stats.longest}</b>
          <span>longest streak</span>
        </div>
      </div>
      <div className="hm-scroll" ref={scroller}>
        <div className="hm" role="img" aria-label={`Activity for the last year: ${stats.activeDays} active days, ${stats.answers} answers`}>
          <div className="hm-months" aria-hidden="true">
            {monthLabels.map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
          <div className="hm-body">
            <div className="hm-dow" aria-hidden="true">
              <span />
              <span>Mon</span>
              <span />
              <span>Wed</span>
              <span />
              <span>Fri</span>
              <span />
            </div>
            <div className="hm-grid">
              {weeks.map((col, w) => (
                <div className="hm-col" key={w}>
                  {col.map((c) => (
                    <i
                      key={c.key}
                      className={c.future ? 'hm-x' : `hm-${level(c.score)}`}
                      title={
                        c.future
                          ? ''
                          : `${c.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}: ${
                              c.score
                                ? `${c.answered} answer${c.answered === 1 ? '' : 's'}, ${c.sessions} session${c.sessions === 1 ? '' : 's'}, ${c.minutes} min`
                                : 'no activity'
                            }`
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="hm-foot">
        <span className="small">
          {stats.best
            ? `Busiest day: ${stats.best.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${stats.best.answered} answers and ${stats.best.minutes} min.`
            : 'Answer a question or study a topic and your first square fills in.'}
        </span>
        <span className="hm-legend" aria-hidden="true">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} className={`hm-${l}`} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}
