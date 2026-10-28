'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { AdSlot } from '@/components/ads/AdSlot';
import { Icon } from '@/components/ui/Icon';
import type { ClassroomController, ClassroomSnapshot, PanelTab } from '@/lib/classroom/controller';
import { SIM_SPECS } from '@/lib/domain/sim';
import { useApp } from '@/lib/store';
import { dayKey, fmtTime } from '@/lib/util';
import { useAddons } from '@/hooks/useAddons';
import { Md } from '@/components/learn/Md';
import { AskTab } from './AskTab';
import { MiniQuiz } from './MiniQuiz';

/** The study area under the stage: the lesson, its live model, questions, a game, the notes, and the tutor. */
function tabsFor(ctrl: ClassroomController): [PanelTab, string][] {
  const t: [PanelTab, string][] = [['outline', 'Lesson']];
  if (ctrl.S) t.push(['model', 'Model']);
  t.push(['check', 'Check'], ['play', 'Play']);
  if (ctrl.topic.notes) t.push(['notes', 'Notes']);
  if (!ctrl.demo) t.push(['ask', 'Ask']);
  return t;
}

/** The study notes the server wrote for this topic, laid out to be read. */
function Notes({ md }: { md: string }) {
  return (
    <div className="cr-notes">
      <Md md={md} />
    </div>
  );
}

/** Where the learner stands on this topic, and what to do next. */
function Progress({ tid, courseId }: { tid: string; courseId: string }) {
  const m = useApp((st) => st.mastery[tid]);
  const today = useApp((st) => st.minutes[dayKey()] ?? 0);
  const est = Math.round((m?.est ?? 0) * 100);
  return (
    <div className="cr-prog">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="label">This topic</span>
        <span className="small">
          {m?.att ? `${est}% estimate · ${m.att} answer${m.att === 1 ? '' : 's'}` : 'Not practised yet'}
        </span>
      </div>
      <div className="bar">
        <i style={{ width: `${est}%` }} className={est < 50 ? 'lo' : est < 70 ? 'mid' : 'hi'} />
      </div>
      <div className="row wrap-r" style={{ gap: 8 }}>
        <Link href={`/app/courses/${courseId}/practice?topic=${tid}`} className="btn xs">
          Practise
        </Link>
        <Link href={`/app/courses/${courseId}/topics/${tid}`} className="btn xs">
          Lesson view
        </Link>
        <span className="small">{`Studied today: ${Math.round(today)} min`}</span>
      </div>
    </div>
  );
}

export function SidePanel({ ctrl, snap }: { ctrl: ClassroomController; snap: ClassroomSnapshot }) {
  const t = ctrl.topic;
  const S = ctrl.S;
  const best = useApp((s) => s.gameBest[ctrl.tid]);
  const addons = useAddons();

  let body: React.ReactNode;
  if (snap.tab === 'outline') {
    body = (
      <>
        {ctrl.demo ? null : <Progress tid={ctrl.tid} courseId={ctrl.course.id} />}
        <div className="list">
          {t.slides.map((s, i) => (
            <button
              key={i}
              type="button"
              className={clsx('li link cr-li', i === snap.idx && 'on')}
              style={{ textAlign: 'left', width: '100%' }}
              onClick={() => ctrl.goSlide(i)}
            >
              <span className="cr-n">{i + 1}</span>
              <div className="grow">
                <div className="t">{s.t}</div>
                <div className="s">{fmtTime(ctrl.tl.durs[i])}</div>
              </div>
              {i === snap.idx ? <Icon name="play" size={13} /> : null}
            </button>
          ))}
        </div>
        <div className="callout" style={{ marginTop: 14 }}>
          <Icon name="info" size={16} />
          <span>{`The narration comes from the lesson written for this topic. ${snap.voice ? 'It is spoken with your browser’s voice.' : 'Turn on the speaker button to hear it with your browser’s voice.'}`}</span>
        </div>
        {ctrl.demo ? null : <AdSlot place="panel" height={250} />}
        {t.demo === 'concept' && !t.ai ? (
          <div className="callout warn" style={{ marginTop: 10 }}>
            <Icon name="alert" size={16} />
            <span>
              Template lesson. The model on the stage is a placeholder, and the board only reflects your
              syllabus heading.
            </span>
          </div>
        ) : null}
      </>
    );
  } else if (snap.tab === 'model') {
    if (!S) body = <p className="small">This lesson has no physical model.</p>;
    else {
      const spec = SIM_SPECS[S.kind];
      body = (
        <>
          <div className="sims" style={{ gridTemplateColumns: '1fr' }}>
            {spec.params.map((sp) => {
              const v = snap.params[sp.k] ?? sp.def;
              const dp = sp.step < 1 ? (sp.step < 0.1 ? 2 : 1) : 0;
              const id = `m-${sp.k}`;
              return (
                <div className="sim-sl" key={sp.k}>
                  <label htmlFor={id}>{sp.label}</label>
                  <input
                    id={id}
                    type="range"
                    min={sp.min}
                    max={sp.max}
                    step={sp.step}
                    value={v}
                    style={{ '--pct': `${((v - sp.min) / (sp.max - sp.min)) * 100}%` } as React.CSSProperties}
                    onChange={(e) => ctrl.setParam(sp.k, +e.target.value)}
                  />
                  <output htmlFor={id}>{`${(+v).toFixed(dp)}${sp.unit ? ` ${sp.unit}` : ''}`}</output>
                </div>
              );
            })}
          </div>
          <div className="row wrap-r">
            <button className="btn sm solid" type="button" onClick={() => ctrl.toggleSim()}>
              <Icon name={snap.simPlay ? 'pause' : 'play'} size={14} />
              {snap.simPlay ? 'Pause model' : 'Run model'}
            </button>
            <button className="btn sm" type="button" onClick={() => ctrl.resetSim()}>
              <Icon name="replay" size={14} />
              Reset
            </button>
          </div>
          <dl className="readouts">
            {snap.readouts.map(([k, val, u]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val + (u ? ` ${u}` : '')}</dd>
              </div>
            ))}
          </dl>
          <p className="small">
            The model is on the stage to the right of the screen. Choose Model above the stage to look at it
            closely.
          </p>
        </>
      );
    }
  } else if (snap.tab === 'play') {
    body = (
      <div className="gm-promo">
        <div className="gm-hearts">♥ ♥ ♥</div>
        <h3>Concept Rush</h3>
        <p className="body">
          Beat the clock, keep your hearts, then match the ideas. A fun way to revise this topic.
        </p>
        <button className="btn solid lg" type="button" onClick={() => ctrl.openGame()}>
          <Icon name="play" size={16} />
          Play now
        </button>
        <p className="small">
          {best
            ? `Your best: ${best.xp} XP · ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}`
            : 'No score yet. Set the first one.'}
        </p>
      </div>
    );
  } else if (snap.tab === 'notes') {
    body = <Notes md={t.notes ?? ''} />;
  } else if (snap.tab === 'ask') {
    body = <AskTab title={t.title} courseId={ctrl.course.id} topicId={ctrl.tid} />;
  } else body = <MiniQuiz ctrl={ctrl} />;

  return (
    <aside className="cr-side" aria-label="Lesson panel">
      <div className="tabs" role="tablist">
        {tabsFor(ctrl).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={snap.tab === k}
            onClick={() => ctrl.setTab(k)}
          >
            {l}
            {k === 'ask' && addons.loaded && !addons.chatbot && addons.freeChatLeft === 0 ? (
              <em className="navtag">Add-on</em>
            ) : null}
          </button>
        ))}
      </div>
      <div className="cr-pbody">{body}</div>
    </aside>
  );
}
