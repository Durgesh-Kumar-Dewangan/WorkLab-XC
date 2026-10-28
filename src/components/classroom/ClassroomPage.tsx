'use client';

import { Icon } from '@/components/ui/Icon';
import React from 'react';
import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import { CourseMissing } from '@/components/app/EmptyWorkspace';
import { LimitNotice } from '@/components/app/LimitNotice';
import { AiGenAnimation } from '@/components/ui/AiGenAnimation';
import { useLesson } from '@/hooks/useLesson';
import { demoCourse } from '@/lib/demo/course';
import { ClassroomController } from '@/lib/classroom/controller';
import { useApp } from '@/lib/store';
import { useCourse } from '@/lib/store/hooks';
import { toast } from '@/lib/ui/toast';
import type { HalftoneCanvas } from '@/lib/fx/halftone';
import { ConceptRush } from './ConceptRush';
import { openClassroomHelp, openClassroomSettings } from './dialogs';
import { Fallback } from './Fallback';
import { Caption, Dock, TopBar, panelClass } from './Hud';
import { FinishOverlay, IntroOverlay } from './Overlays';
import { ClassroomAd } from './ClassroomAd';
import { SidePanel } from './SidePanel';
import { StudioDocks } from './StudioDocks';
import { ZoomPad } from './ZoomPad';

const ClassroomCanvas = dynamic(() => import('./scene/ClassroomCanvas'), { ssr: false });
const BabylonClassroom = dynamic(() => import('./babylon/BabylonClassroom'), { ssr: false });

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch {
    return false;
  }
}

class Boundary extends Component<
  { onError: (reason: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    this.props.onError(
      err instanceof Error && err.message
        ? `The 3D engine could not start (${err.message}).`
        : 'The 3D engine could not start.',
    );
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ClassroomPage({ cid, tid, demo = false }: { cid: string; tid: string; demo?: boolean }) {
  const stored = useCourse(cid);
  const course = demo ? demoCourse() : stored;
  const topic = course?.topics[tid];
  const lesson = useLesson(cid, tid);
  const [ctrl, setCtrl] = useState<ClassroomController | null>(null);

  useEffect(() => {
    if (!course || !topic || lesson.status !== 'ready') return;
    const c = new ClassroomController(course, tid, topic, demo);
    if (!demo) useApp.getState().setLastTopic(cid, tid);
    setCtrl(c);
    return () => c.dispose();
    // The controller owns a snapshot of the course for the life of the visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, tid, lesson.status]);

  useEffect(() => {
    document.documentElement.classList.add('cr-lock');
    return () => document.documentElement.classList.remove('cr-lock');
  }, []);

  if (!course || !topic) return <CourseMissing />;
  if (lesson.status === 'writing')
    return (
      <div className="cr">
        <div className="cr-load">
          <AiGenAnimation title={`Writing “${topic.title}”`} />
        </div>
      </div>
    );
  if (lesson.status === 'failed')
    return (
      <div className="cr" style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ maxWidth: 520 }}>
          <LimitNotice error={lesson.error} onRetry={lesson.retry} />
        </div>
      </div>
    );
  if (!ctrl) return <div className="cr" aria-busy="true" />;
  return <Room ctrl={ctrl} />;
}

function Room({ ctrl }: { ctrl: ClassroomController }) {
  const snap = useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot, ctrl.getSnapshot);
  const quality = useApp((s) => s.settings.quality);
  const wanted = useApp((s) => s.settings.engine);
  const hall = useApp((s) => s.settings.hall);
  const backdrop = useApp((s) => s.settings.backdrop);
  const uiPref = useApp((s) => s.settings.classroomUi);
  // if Babylon.js cannot start on this device, the three.js classroom takes over before the 2D fallback is used
  const [engine, setEngine] = useState<'babylon' | 'three'>(wanted === 'three' ? 'three' : 'babylon');
  const envId = useApp((s) => s.assets.env);
  const root = useRef<HTMLDivElement>(null);
  const ht = useRef<HalftoneCanvas>(null);
  const [fail, setFail] = useState<string | null>(() => (webglOk() ? null : 'This browser has no WebGL.'));
  const [ready, setReady] = useState(false);
  const [vw, setVw] = useState(() => window.innerWidth);

  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const [full, setFull] = useState(false);
  // lecture only: every control is hidden and the board is shielded from stray touches, until the small lock is tapped
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const toggleLock = useCallback(() => {
    const next = !lockedRef.current;
    lockedRef.current = next;
    setLocked(next);
    if (next) toast('Controls hidden. Tap the lock, or press L, to bring them back.');
  }, []);
  // keep the button in step with the browser, and hand the screen's rotation back when full screen ends
  useEffect(() => {
    const on = () => {
      const f = !!document.fullscreenElement;
      setFull(f);
      if (!f) {
        try {
          screen.orientation?.unlock?.();
        } catch {
          /* not supported */
        }
      }
    };
    document.addEventListener('fullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      try {
        screen.orientation?.unlock?.();
      } catch {
        /* not supported */
      }
    };
  }, []);

  const toggleFull = useCallback(async () => {
    const el = root.current;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (!el?.requestFullscreen) {
        // iPhone browsers cannot full-screen a page: ask for the sideways view by hand instead
        toast('Turn your phone sideways for the full classroom view.');
        return;
      }
      await el.requestFullscreen({ navigationUI: 'hide' });
      // on a phone, turn the screen sideways by itself so the board fills it
      const small = Math.min(window.screen.width, window.screen.height) < 700;
      if (small) {
        try {
          await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.(
            'landscape',
          );
        } catch {
          toast('Turn your phone sideways for the full classroom view.');
        }
      }
    } catch {
      toast('Full screen is blocked in this view. Open the page in its own tab to use it.', 'err');
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (ctrl.getSnapshot().game) return;
      if (el && /^(input|textarea|select)$/i.test(el.tagName)) return;
      if (el?.closest?.('.scrim')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = ctrl.getSnapshot();
      const k = e.key;
      if (k === ' ') {
        if (el && /^(button|a)$/i.test(el.tagName)) return;
        e.preventDefault();
        ctrl.togglePlay();
      } else if (k === 'ArrowRight') ctrl.goSlide(s.idx + 1);
      else if (k === 'ArrowLeft') ctrl.goSlide(s.idx - 1);
      else if (k >= '1' && k <= '3') ctrl.setCam((['board', 'model', 'overview'] as const)[+k - 1], true);
      else if (/^g$/i.test(k)) ctrl.openGame();
      else if (/^c$/i.test(k)) ctrl.toggleCaptions();
      else if (/^m$/i.test(k)) ctrl.toggleVoice();
      else if (/^h$/i.test(k) && !fail) ctrl.toggleHalftone();
      else if (/^p$/i.test(k)) ctrl.setPanel(!s.panel);
      else if (/^f$/i.test(k)) void toggleFull();
      else if (/^l$/i.test(k)) toggleLock();
      else if (k === 'Escape' && lockedRef.current) toggleLock();
      else if (k === '?') openClassroomHelp();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ctrl, fail, toggleFull, toggleLock]);

  const onReady = useCallback(() => {
    ctrl.bootCamera();
    setReady(true);
  }, [ctrl]);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const onFail = useCallback((reason: string) => {
    if (engineRef.current === 'babylon') {
      setEngine('three');
      return;
    }
    setFail((f) => f ?? reason);
  }, []);
  // the panel is a side column only above 1000px (see 60-classroom.css); below that it is a bottom sheet
  const studio = uiPref === 'studio' && vw > 1000;
  const panelPx = !studio && snap.panel && vw > 1000 ? Math.min(380, vw * 0.32) : 0;

  return (
    <div
      className={`${panelClass(snap.panel)}${studio ? ' studio' : ''}${full ? ' is-full' : ''}${locked ? ' is-locked' : ''}`}
      ref={root}
    >
      <div className="cr-stage">
        {fail ? (
          <Fallback ctrl={ctrl} snap={snap} reason={fail} />
        ) : (
          <>
            <Boundary onError={onFail}>
              {React.createElement(engine === 'babylon' ? BabylonClassroom : ClassroomCanvas, {
                key: `${engine}-${hall}-${backdrop}`,
                backdrop,
                hall,
                ctrl,
                quality,
                panelPx,
                halftone: snap.halftone,
                overlay: ht,
                envId,
                onReady,
                onFail,
              })}
            </Boundary>
            <canvas ref={ht} className="cr-ht" hidden={!snap.halftone} aria-hidden="true" />
            {ready ? <ZoomPad ctrl={ctrl} /> : null}
          </>
        )}
      </div>
      {!fail && !ready ? (
        <div className="cr-load" role="status">
          <span className="label">Setting up the classroom</span>
          <span className="small">Loading the room and screen</span>
        </div>
      ) : null}
      <TopBar
        ctrl={ctrl}
        snap={snap}
        fallback={!!fail}
        onLock={toggleLock}
        onSettings={() => openClassroomSettings(ctrl)}
        onHelp={openClassroomHelp}
      />
      <Caption snap={snap} />
      {locked ? (
        <>
          <div className="cr-shield" aria-hidden="true" />
          <button
            className="cr-unlock"
            type="button"
            aria-label="Show the controls again"
            title="Show controls (L)"
            onClick={toggleLock}
          >
            <Icon name="lock" size={18} />
          </button>
        </>
      ) : null}
      <Dock ctrl={ctrl} snap={snap} full={full} onFull={() => void toggleFull()} />
      {studio ? <StudioDocks ctrl={ctrl} snap={snap} ready={ready} /> : null}
      <SidePanel ctrl={ctrl} snap={snap} />
      <ClassroomAd snap={snap} demo={ctrl.demo} />
      {snap.intro && (fail || ready) && !snap.game ? <IntroOverlay ctrl={ctrl} /> : null}
      {snap.done && !snap.game ? <FinishOverlay ctrl={ctrl} /> : null}
      {snap.game ? <ConceptRush ctrl={ctrl} /> : null}
    </div>
  );
}
