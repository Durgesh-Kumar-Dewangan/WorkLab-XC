'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { masteryOf, topicTitle } from '@/lib/domain/courses';
import type { ClassroomController } from '@/lib/classroom/controller';
import { useApp } from '@/lib/store';

const CONF: [string, number][] = [
  ['Not at all', 0.1],
  ['A little', 0.3],
  ['Somewhat', 0.5],
  ['Fairly', 0.7],
  ['Very', 0.9],
];

/** In-classroom understanding check. Answers feed the same estimate as the Practice page. */
export function MiniQuiz({ ctrl }: { ctrl: ClassroomController }) {
  const qs = ctrl.topic.qs;
  const tid = ctrl.tid;
  const [i, setI] = useState(0);
  const [res, setRes] = useState<(boolean | null)[]>([]);
  const [fb, setFb] = useState<{ ok: boolean | null; text: string; picked?: number } | null>(null);
  const [num, setNum] = useState('');

  const answer = (ok: boolean | null, text: string, picked?: number) => {
    setRes((r) => [...r, ok]);
    setFb({ ok, text, picked });
  };
  const next = () => {
    setFb(null);
    setNum('');
    if (i + 1 >= qs.length && !ctrl.demo) {
      const a = useApp.getState();
      a.logActivity(
        'practice',
        `Checked understanding of ${topicTitle(a, ctrl.course, tid)} in the classroom`,
        `/app/courses/${ctrl.course.id}/practice?topic=${tid}`,
        ctrl.course.id,
      );
    }
    setI(i + 1);
  };

  if (i >= qs.length) {
    const m = masteryOf(useApp.getState(), tid);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3>Done</h3>
        <p className="body">{`${res.filter((r) => r === true).length} of ${res.filter((r) => r !== null).length} correct. Estimate for this topic is now ${Math.round(m.est * 100)}%. It is only an estimate.`}</p>
        <button
          className="btn sm"
          type="button"
          onClick={() => {
            setI(0);
            setRes([]);
            setFb(null);
          }}
        >
          Again
        </button>
      </div>
    );
  }
  const x = qs[i];
  const locked = fb !== null;
  const tol = x.type === 'num' ? Math.max(x.tol, Math.abs(x.ans) * 0.02) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span className="label">{`Question ${i + 1} of ${qs.length}`}</span>
      <p style={{ fontSize: 16, lineHeight: 1.4 }}>{x.q}</p>
      {x.type === 'mcq' ? (
        <div className="opts">
          {x.opts.map((o, k) => (
            <button
              key={k}
              type="button"
              className={clsx('btn sm', locked && (k === x.ans ? 'okc' : k === fb?.picked ? 'badc' : ''))}
              style={{
                height: 'auto',
                minHeight: 34,
                textAlign: 'left',
                justifyContent: 'flex-start',
                padding: '8px 14px',
                borderRadius: 12,
              }}
              disabled={locked}
              onClick={() => {
                const ok = k === x.ans;
                useApp.getState().recordAnswer(tid, ok);
                answer(ok, `${ok ? 'Correct. ' : 'Not quite. '}${x.why}`, k);
              }}
            >
              {`${String.fromCharCode(65 + k)}. ${o}`}
            </button>
          ))}
        </div>
      ) : x.type === 'num' ? (
        <div className="row">
          <input
            className="input"
            inputMode="decimal"
            placeholder={`Number${x.unit ? ` (${x.unit})` : ''}`}
            aria-label="Answer"
            disabled={locked}
            value={num}
            onChange={(e) => setNum(e.target.value)}
          />
          <button
            className="btn sm solid"
            type="button"
            disabled={locked}
            onClick={() => {
              const v = parseFloat(num.replace(',', '.'));
              if (!Number.isFinite(v)) return;
              const ok = Math.abs(v - x.ans) <= tol;
              useApp.getState().recordAnswer(tid, ok);
              answer(
                ok,
                `${ok ? 'Correct. ' : `Not quite. The answer is ${x.ans}${x.unit ? ` ${x.unit}` : ''}. `}${x.why}`,
              );
            }}
          >
            Check
          </button>
        </div>
      ) : (
        <div className="pill-row">
          {CONF.map(([l, v]) => (
            <button
              key={l}
              type="button"
              className="btn sm"
              disabled={locked}
              onClick={() => {
                useApp.getState().recordConfidence(tid, v);
                answer(null, x.why);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <div aria-live="polite">
        {fb ? (
          <div className={clsx('callout', fb.ok === false && 'warn')}>
            <Icon name={fb.ok ? 'check' : 'info'} size={16} />
            <span>{fb.text}</span>
          </div>
        ) : null}
      </div>
      {fb ? (
        <button className="btn sm solid" type="button" autoFocus onClick={next}>
          Next
        </button>
      ) : null}
    </div>
  );
}
