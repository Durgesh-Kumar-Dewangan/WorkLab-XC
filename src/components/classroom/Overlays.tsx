'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdSlot } from '@/components/ads/AdSlot';
import { DrillPlayer } from '@/components/app/DrillPlayer';
import { Icon } from '@/components/ui/Icon';
import { nextTopicAfter, topicTitle } from '@/lib/domain/courses';
import type { ClassroomController } from '@/lib/classroom/controller';
import { useLearner } from '@/lib/store/hooks';

export function IntroOverlay({ ctrl }: { ctrl: ClassroomController }) {
  const d = useLearner();
  const { topic: t, course: c, tid } = ctrl;
  return (
    <div className="cr-intro" role="dialog" aria-label="Lesson introduction">
      <div className="cr-introcard">
        <span className="label">{`Immersive lesson · ${t.mins} min`}</span>
        <h1 className="h2">{topicTitle(d, c, tid)}</h1>
        <p className="body">{t.summary}</p>
        <div className="row wrap-r">
          <button className="btn solid lg" type="button" autoFocus onClick={() => ctrl.play()}>
            <Icon name="play" size={16} />
            Begin lesson
          </button>
          <button className="btn lg" type="button" onClick={() => ctrl.dismissIntro()}>
            Look around first
          </button>
        </div>
        <p className="small">Drag to orbit · scroll to zoom · Space to play or pause · ? for all shortcuts</p>
      </div>
    </div>
  );
}

export function FinishOverlay({ ctrl }: { ctrl: ClassroomController }) {
  const d = useLearner();
  const { course: c, tid } = ctrl;
  const nx = nextTopicAfter(c, tid);
  const [drill, setDrill] = useState(false);
  if (drill && !ctrl.demo)
    return (
      <div className="cr-intro" role="dialog" aria-label="Practice round">
        <div className="cr-introcard cr-drillcard">
          <DrillPlayer title={topicTitle(d, c, tid)} onClose={() => setDrill(false)} />
        </div>
      </div>
    );
  return (
    <div className="cr-intro" role="dialog" aria-label="Lesson complete">
      <div className="cr-introcard">
        <Icon name="check" size={28} />
        <h1 className="h2">Lesson complete</h1>
        <p className="body">Check what stuck. Your answers update the estimate for this topic.</p>
        <div className="row wrap-r">
          {ctrl.demo ? (
            <Link href="/register" className="btn solid lg">
              <Icon name="upload" size={16} />
              Start with your own syllabus
            </Link>
          ) : (
            <button className="btn solid lg" type="button" onClick={() => setDrill(true)}>
              <Icon name="target" size={16} />
              Practice round
            </button>
          )}
          <button className="btn lg" type="button" onClick={() => ctrl.restart()}>
            <Icon name="replay" size={16} />
            Replay
          </button>
          {nx ? (
            <Link href={ctrl.demo ? `/demo/classroom/${nx}` : `/classroom/${c.id}/${nx}`} className="btn lg">
              {`Next: ${topicTitle(d, c, nx)}`}
              <Icon name="arrow-r" size={15} />
            </Link>
          ) : null}
        </div>
        <button
          className="btn lg"
          type="button"
          onClick={() => {
            ctrl.dismissDone();
            ctrl.openGame();
          }}
        >
          <Icon name="target" size={16} />
          Play revision game
        </button>
        <button className="btn xs ghost" type="button" onClick={() => ctrl.dismissDone()}>
          Stay in the room
        </button>
        {ctrl.demo ? null : <AdSlot place="finish" height={250} />}
      </div>
    </div>
  );
}
