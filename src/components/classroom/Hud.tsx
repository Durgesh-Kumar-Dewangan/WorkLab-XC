'use client';

import Link from 'next/link';
import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import type { ClassroomController, ClassroomSnapshot } from '@/lib/classroom/controller';
import { CAM_KEYS, CAM_PRESETS } from '@/lib/classroom/timeline';
import type { IconName } from '@/lib/icon-paths';
import { fmtTime } from '@/lib/util';
import { topicTitle } from '@/lib/domain/courses';
import { useLearner } from '@/lib/store/hooks';

function Tool({
  label,
  icon,
  on,
  onClick,
  hidden,
}: {
  label: string;
  icon: IconName;
  on: boolean;
  onClick: () => void;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      className="icon-btn bordered"
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} size={17} />
    </button>
  );
}

export function TopBar({
  ctrl,
  snap,
  fallback,
  onSettings,
  onHelp,
  onLock,
}: {
  ctrl: ClassroomController;
  snap: ClassroomSnapshot;
  fallback: boolean;
  onSettings: () => void;
  onHelp: () => void;
  onLock?: () => void;
}) {
  const d = useLearner();
  const c = ctrl.course;
  return (
    <header className="cr-top">
      <Link
        href={ctrl.demo ? '/demo' : `/app/courses/${c.id}/topics/${ctrl.tid}`}
        className="btn sm"
        aria-label="Exit classroom"
      >
        <Icon name="arrow-l" size={16} />
        <span className="hide-s">Exit</span>
      </Link>
      <div className="cr-title">
        <span className="label">{c.title}</span>
        <b>{topicTitle(d, c, ctrl.tid)}</b>
      </div>
      <div className="grow" />
      {!fallback ? (
        <>
          <div className="seg" role="group" aria-label="Camera view">
            {CAM_KEYS.map((k, i) => (
              <button
                key={k}
                type="button"
                aria-pressed={snap.cam === k}
                title={`Key ${i + 1}`}
                onClick={() => ctrl.setCam(k, true)}
              >
                {CAM_PRESETS[k].label}
              </button>
            ))}
          </div>
          <button
            className="btn xs mono"
            type="button"
            aria-pressed={snap.autoCam}
            title="Let the lesson move the camera"
            onClick={() => ctrl.toggleAutoCam()}
          >
            Auto camera
          </button>
        </>
      ) : null}
      <div className="cr-tools">
        {onLock ? (
          <button
            className="icon-btn bordered"
            type="button"
            aria-label="Lecture only: hide the controls and lock"
            title="Lecture only (L)"
            onClick={onLock}
          >
            <Icon name="lock" size={17} />
          </button>
        ) : null}
        <Tool
          label="Another real-world photo"
          icon="image"
          on={false}
          hidden={!ctrl.hasPhoto}
          onClick={() => ctrl.nextPhoto()}
        />
        <Tool label="Captions (C)" icon="msg" on={snap.captions} onClick={() => ctrl.toggleCaptions()} />
        <Tool label="Spoken narration (M)" icon="vol" on={snap.voice} onClick={() => ctrl.toggleVoice()} />
        <Tool
          label="Halftone view (H)"
          icon="grid"
          on={snap.halftone}
          onClick={() => ctrl.toggleHalftone()}
          hidden={fallback}
        />
        <button
          className="icon-btn bordered"
          type="button"
          aria-label="Classroom settings"
          title="Settings"
          onClick={onSettings}
        >
          <Icon name="sliders" size={17} />
        </button>
        <button
          className="icon-btn bordered"
          type="button"
          aria-label="Keyboard shortcuts"
          title="Shortcuts (?)"
          onClick={onHelp}
        >
          <Icon name="keyboard" size={17} />
        </button>
        <button
          className="icon-btn bordered"
          type="button"
          aria-label="Toggle side panel"
          aria-expanded={snap.panel}
          title="Side panel (P)"
          onClick={() => ctrl.setPanel(!snap.panel)}
        >
          <Icon name="pright" size={17} />
        </button>
      </div>
    </header>
  );
}

export function Caption({ snap }: { snap: ClassroomSnapshot }) {
  return (
    <>
      <div className="cr-cap" aria-live="off" hidden={!snap.captions || !snap.caption}>
        {snap.caption}
      </div>
    </>
  );
}

const SPEEDS = [0.75, 1, 1.25, 1.5];

export function Dock({
  ctrl,
  snap,
  full,
  onFull,
}: {
  ctrl: ClassroomController;
  snap: ClassroomSnapshot;
  full?: boolean;
  onFull?: () => void;
}) {
  const { tl } = ctrl;
  const slides = ctrl.topic.slides;
  const s = slides[snap.idx];
  return (
    <div className="cr-dock">
      <div className="cr-dockrow">
        <button
          className="icon-btn cr-prev"
          type="button"
          aria-label="Previous slide"
          disabled={snap.idx === 0 && snap.t < 0.5}
          onClick={() => ctrl.goSlide(snap.idx - 1)}
        >
          <Icon name="skip-b" size={18} />
        </button>
        <button
          className="cr-play"
          type="button"
          aria-label={snap.playing ? 'Pause lesson' : 'Play lesson'}
          aria-pressed={snap.playing}
          onClick={() => ctrl.togglePlay()}
        >
          <Icon name={snap.playing ? 'pause' : 'play'} size={22} />
        </button>
        <button
          className="icon-btn cr-next"
          type="button"
          aria-label="Next slide"
          disabled={snap.idx >= slides.length - 1}
          onClick={() => ctrl.goSlide(snap.idx + 1)}
        >
          <Icon name="skip-f" size={18} />
        </button>
        <div className="cr-scrubwrap">
          <div className="cr-ticks" aria-hidden="true">
            {tl.starts.map((st, i) => (
              <i key={i} style={{ left: `${(st / tl.total) * 100}%` }} />
            ))}
          </div>
          <input
            type="range"
            className="cr-scrub"
            min={0}
            max={tl.total}
            step={0.1}
            value={snap.t}
            aria-label="Lesson timeline"
            aria-valuetext={`Slide ${snap.idx + 1} of ${slides.length}, ${fmtTime(snap.t)} of ${fmtTime(tl.total)}`}
            style={{ '--pct': `${(snap.t / tl.total) * 100}%` } as React.CSSProperties}
            onChange={(e) => ctrl.seek(+e.target.value)}
          />
        </div>
        <span className="cr-time num">{`${fmtTime(snap.t)} / ${fmtTime(tl.total)}`}</span>
        <button
          className="cr-speed"
          type="button"
          aria-label={`Playback speed ${snap.speed} times. Tap to change.`}
          title="Playback speed"
          onClick={() => ctrl.setSpeed(SPEEDS[(SPEEDS.indexOf(snap.speed) + 1) % SPEEDS.length])}
        >
          {`${snap.speed}×`}
        </button>
        {onFull ? (
          <button
            className="icon-btn cr-full"
            type="button"
            aria-label={full ? 'Leave full screen' : 'Full screen, turns the phone sideways'}
            title="Full screen (F)"
            onClick={onFull}
          >
            <Icon name={full ? 'min' : 'max'} size={16} />
          </button>
        ) : null}
      </div>
      <div className="cr-dockrow sub">
        <span className="cr-slide">{`Slide ${snap.idx + 1} of ${slides.length} · ${s.t}`}</span>
      </div>
    </div>
  );
}

export const panelClass = (on: boolean) => clsx('cr', on && 'panel-on');
