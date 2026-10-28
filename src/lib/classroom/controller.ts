import { apiUrl } from '../config';
import { api } from '../api/client';
import type { Object3D } from 'three';
import type { Course, Topic } from '../domain/types';
import { SIM_SPECS, makeSim, type Readout, type Sim, type SimParamValues } from '../domain/sim';
import { topicTitle } from '../domain/courses';
import { useApp } from '../store';
import { subjectOf, type SubjectLook } from './subject';
import { toast } from '../ui/toast';
import { clamp, prefersReducedMotion, speechAvailable } from '../util';
import {
  CAM_KEYS,
  boardReveal,
  camKey,
  formulaText,
  lessonTimeline,
  slideIndexAt,
  slideProgress,
  type AvState,
  type CamKey,
  type Timeline,
} from './timeline';

export type PanelTab = 'outline' | 'model' | 'check' | 'play' | 'notes' | 'ask';
export interface InspectInfo {
  title: string;
  body: string;
}
export interface CamRequest {
  seq: number;
  name: CamKey;
  instant: boolean;
}

/** Immutable view of the controller for React. Replaced (and subscribers notified) at most ~10 times a second. */
export interface ClassroomSnapshot {
  t: number;
  idx: number;
  playing: boolean;
  started: boolean;
  speed: number;
  captions: boolean;
  voice: boolean;
  autoCam: boolean;
  halftone: boolean;
  panel: boolean;
  tab: PanelTab;
  done: boolean;
  simPlay: boolean;
  simDone: boolean;
  cam: CamKey | null;
  inspect: InspectInfo | null;
  intro: boolean;
  game: boolean;
  caption: string;
  params: SimParamValues;
  readouts: Readout[];
}

export interface BoardPhoto {
  img: HTMLImageElement;
  credit: string;
}

export interface BoardData {
  photo?: BoardPhoto | null;
  title: string;
  bullets: string[];
  reveal: number[];
  formula?: string;
  formulaAlpha: number;
  idx: number;
  n: number;
  progress: number;
  crumb: string;
  /** What the lesson is about, so the screen can look like it. */
  subject?: string;
}

const EMIT_MS = 100;

/**
 * Framework-free lesson state machine: timeline, narration, camera requests and the physics model.
 * React reads it through useSyncExternalStore; the 3D scene reads the public fields every frame without re-rendering.
 */
export class ClassroomController {
  readonly tl: Timeline;
  readonly S: Sim | null;
  readonly reduced = prefersReducedMotion();

  // scene-facing, read every frame
  avState: AvState = 'idle';
  talking = false;
  camRequest: CamRequest = { seq: 0, name: 'board', instant: true };
  /** A request from the zoom buttons: multiply the camera's distance from what it looks at by `factor`. */
  zoomRequest = { seq: 0, factor: 1 };
  paramsVersion = 0;
  selected: Object3D | null = null;

  private t = 0;
  private idx = 0;
  playing = false;
  private started = false;
  private speed: number;
  private captions: boolean;
  private voice: boolean;
  private autoCam = true;
  private halftone = false;
  private panel: boolean;
  private tab: PanelTab = 'outline';
  private done = false;
  private simPlay = false;
  private cam: CamKey | null = 'board';
  private inspect: InspectInfo | null = null;
  private intro = true;
  private game = false;
  private minuteAcc = 0;

  private snap: ClassroomSnapshot;
  private subs = new Set<() => void>();
  /** What the lesson is about: its own tag, or the words in its titles. The screen dresses to match. */
  readonly subject: SubjectLook;
  private lastEmit = 0;
  private dirty = false;

  constructor(
    readonly course: Course,
    readonly tid: string,
    readonly topic: Topic,
    /** The public demo: nothing is recorded and links stay inside the demo. */
    readonly demo = false,
  ) {
    const set = useApp.getState().settings;
    this.subject = subjectOf([course.title, topic.title, topic.summary ?? ''], topic.subject);
    this.tl = lessonTimeline(topic);
    this.S =
      topic.demo !== 'concept' && topic.demo in SIM_SPECS
        ? makeSim(topic.demo, topic.slides[0].p as SimParamValues | undefined)
        : null;
    this.speed = set.speed || 1;
    this.captions = set.captions;
    this.voice = set.voice && speechAvailable();
    this.panel = typeof window !== 'undefined' && window.innerWidth > 1000;
    this.snap = this.build();
    void this.loadPhoto(0);
  }

  /* ---------- React binding ---------- */
  subscribe = (cb: () => void) => {
    this.subs.add(cb);
    return () => void this.subs.delete(cb);
  };
  getSnapshot = () => this.snap;

  private build(): ClassroomSnapshot {
    const s = this.topic.slides[this.idx];
    const p = slideProgress(this.tl, this.t, this.idx);
    const words = s.say.split(/\s+/);
    const cnt = Math.ceil(clamp(p / 0.92, 0, 1) * words.length);
    let caption = words.slice(0, Math.max(cnt, this.playing || this.t > 0 ? 1 : 0)).join(' ');
    if (!this.started && !cnt) caption = '';
    if (caption.length > 190) caption = `… ${caption.slice(-186)}`;
    return {
      t: this.t,
      idx: this.idx,
      playing: this.playing,
      started: this.started,
      speed: this.speed,
      captions: this.captions,
      voice: this.voice,
      autoCam: this.autoCam,
      halftone: this.halftone,
      panel: this.panel,
      tab: this.tab,
      done: this.done,
      simPlay: this.simPlay,
      simDone: !!this.S?.done,
      cam: this.cam,
      inspect: this.inspect,
      intro: this.intro,
      game: this.game,
      caption,
      params: this.S ? { ...this.S.p } : {},
      readouts: this.S ? this.S.readouts() : [],
    };
  }

  private emit(force = false) {
    const now = performance.now();
    if (!force && now - this.lastEmit < EMIT_MS) {
      this.dirty = true;
      return;
    }
    this.lastEmit = now;
    this.dirty = false;
    this.snap = this.build();
    this.subs.forEach((f) => f());
  }

  /* ---------- scene reads ---------- */
  boardData(): BoardData {
    const s = this.topic.slides[this.idx];
    const p = slideProgress(this.tl, this.t, this.idx);
    const { reveal, formulaAlpha } = boardReveal(s, p);
    return {
      photo: this.photos.get(this.idx) ?? null,
      title: s.t,
      bullets: s.b,
      reveal,
      formula: formulaText(s.f),
      formulaAlpha,
      idx: this.idx,
      n: this.topic.slides.length,
      progress: this.t / this.tl.total,
      crumb: `${this.course.title} · ${topicTitle(useApp.getState(), this.course, this.tid)}`,
      subject: this.subject.id,
    };
  }

  /* ---------- clock ---------- */
  tick(dt: number) {
    if (this.playing) {
      this.t += dt * this.speed;
      this.minuteAcc += dt;
      const old = this.idx;
      this.idx = slideIndexAt(this.tl, this.t);
      if (this.idx !== old) this.onSlide();
      if (this.t >= this.tl.total) {
        this.t = this.tl.total;
        this.finish();
        return;
      }
      if (this.minuteAcc >= 15) {
        useApp.getState().addMinutes(this.minuteAcc / 60);
        this.minuteAcc = 0;
      }
      this.updateAvatar();
    }
    if (this.S && this.simPlay) {
      const total = dt;
      const sub = Math.max(1, Math.ceil(total / (1 / 120)));
      for (let i = 0; i < sub; i++) this.S.step(total / sub);
      if (this.S.done) {
        this.simPlay = false;
        this.emit(true);
      }
    }
    if (this.playing || this.dirty || performance.now() - this.lastEmit > 250) this.emit();
  }

  private updateAvatar() {
    const s = this.topic.slides[this.idx];
    const p = slideProgress(this.tl, this.t, this.idx);
    this.avState = this.playing
      ? this.idx === 0 && p < 0.14
        ? 'wave'
        : s.av === 'talk' || !s.av
          ? 'talk'
          : s.av
      : 'idle';
    this.talking = this.playing && p < 0.96 && this.avState !== 'wave';
  }

  /* ---------- transport ---------- */
  play() {
    if (this.done) this.done = false;
    if (this.t >= this.tl.total - 0.05) this.seek(0);
    this.playing = true;
    this.started = true;
    this.intro = false;
    this.simPlay = true;
    this.updateAvatar();
    this.speakFrom();
    if (this.autoCam) this.requestCam(camKey(this.topic.slides[this.idx].cam));
    this.emit(true);
  }
  pause() {
    this.playing = false;
    this.updateAvatar();
    this.stopSpeech();
    this.emit(true);
  }
  togglePlay() {
    if (this.playing) this.pause();
    else this.play();
  }
  seek(tt: number) {
    const old = this.idx;
    this.t = clamp(tt, 0, this.tl.total);
    this.idx = slideIndexAt(this.tl, this.t);
    if (this.idx !== old) this.onSlide();
    if (this.playing) this.speakFrom();
    this.updateAvatar();
    this.emit(true);
  }
  /* ---------- the real-world photo beside a slide ---------- */
  private photos = new Map<number, BoardPhoto>();
  private photoAsked = new Set<number>();
  private photoN = new Map<number, number>();
  /** Finds a freely licensed photograph for the slide's example (once per slide) and redraws the board when it arrives. */
  private async loadPhoto(i: number, force = false) {
    const s = this.topic.slides[i];
    if (
      !s?.ex ||
      this.demo ||
      useApp.getState().settings.slidePhotos === false ||
      typeof window === 'undefined'
    )
      return;
    if (this.photoAsked.has(i) && !force) return;
    this.photoAsked.add(i);
    try {
      const n = this.photoN.get(i) ?? 0;
      const r = await api<{ id: string; credit: string }>(`/example?q=${encodeURIComponent(s.ex)}&n=${n}`);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((ok, bad) => {
        img.onload = () => ok();
        img.onerror = () => bad(new Error('photo'));
        img.src = apiUrl(`/example-image/${r.id}`);
      });
      this.photos.set(i, { img, credit: r.credit });
      this.dirty = true;
      this.emit(true);
    } catch {
      /* no photograph for this one: the slide simply shows its text */
    }
  }
  /** Shows another photograph for the slide that is on the screen. */
  nextPhoto() {
    const i = this.idx;
    this.photoN.set(i, (this.photoN.get(i) ?? 0) + 1);
    void this.loadPhoto(i, true);
  }
  get hasPhoto() {
    return (
      !!this.topic.slides[this.idx]?.ex && !this.demo && useApp.getState().settings.slidePhotos !== false
    );
  }
  goSlide(i: number) {
    this.seek(this.tl.starts[clamp(i, 0, this.topic.slides.length - 1)] + 0.01);
  }
  private onSlide() {
    this.applySlideParams();
    void this.loadPhoto(this.idx);
    if (this.autoCam && this.started) this.requestCam(camKey(this.topic.slides[this.idx].cam));
    if (this.playing) this.speakFrom();
  }
  private applySlideParams() {
    if (!this.S) return;
    const p = this.topic.slides[this.idx].p;
    if (p) {
      this.S.reset(p as SimParamValues);
      this.simPlay = this.playing;
    } else this.S.reset();
    this.paramsVersion++;
  }
  private finish() {
    if (this.done) return;
    this.done = true;
    this.pause();
    if (!this.demo)
      useApp
        .getState()
        .logActivity(
          'lesson',
          `Finished the classroom lesson on ${topicTitle(useApp.getState(), this.course, this.tid)}`,
          `/app/courses/${this.course.id}/topics/${this.tid}`,
          this.course.id,
        );
    this.emit(true);
  }
  restart() {
    this.done = false;
    this.seek(0);
    this.play();
  }
  dismissDone() {
    this.done = false;
    this.emit(true);
  }
  setSpeed(v: number) {
    this.speed = v;
    if (this.voice && this.playing) this.speakFrom();
    this.emit(true);
  }
  dismissIntro() {
    this.intro = false;
    this.emit(true);
  }

  /* ---------- camera ---------- */
  /** Zoom in (factor below 1) or out (above 1) a step. The camera rig keeps it within safe limits. */
  zoom(factor: number) {
    this.zoomRequest = { seq: this.zoomRequest.seq + 1, factor };
    this.userCamera();
  }
  /** Back to a full view of the screen and boards. */
  fitScreen() {
    this.setCam('board', false);
  }
  private requestCam(name: CamKey, instant = false) {
    this.cam = name;
    this.camRequest = { seq: this.camRequest.seq + 1, name, instant };
  }
  setCam(name: CamKey, user = false, instant = false) {
    this.requestCam(name, instant);
    if (user) this.autoCam = false;
    this.emit(true);
  }
  /** Boot sequence: start in the overview, then settle on the board unless the lesson already began. */
  bootCamera() {
    this.setCam('overview', false, true);
    setTimeout(() => {
      if (!this.started && this.cam === 'overview') this.setCam('board');
    }, 350);
  }
  toggleAutoCam() {
    this.autoCam = !this.autoCam;
    if (this.autoCam) this.requestCam(camKey(this.topic.slides[this.idx].cam));
    this.emit(true);
  }
  /** The user grabbed the orbit controls. */
  userCamera() {
    if (!this.autoCam) return;
    this.autoCam = false;
    this.cam = null;
    toast('Auto camera is off. Press 1 to 4 to return to a view.', 'ok');
    this.emit(true);
  }

  /* ---------- panel, toggles ---------- */
  setPanel(on: boolean) {
    this.panel = on;
    this.emit(true);
  }
  setTab(tab: PanelTab) {
    this.tab = tab;
    this.emit(true);
  }
  toggleCaptions() {
    this.captions = !this.captions;
    useApp.getState().updateSettings((s) => void (s.captions = this.captions));
    this.emit(true);
  }
  toggleVoice() {
    if (!speechAvailable()) {
      toast('This browser has no speech voices, so narration stays as text.', 'err');
      return;
    }
    this.voice = !this.voice;
    useApp.getState().updateSettings((s) => void (s.voice = this.voice));
    if (this.voice && this.playing) this.speakFrom();
    else this.stopSpeech();
    this.emit(true);
  }
  toggleHalftone() {
    this.halftone = !this.halftone;
    this.emit(true);
  }
  setCaptions(v: boolean) {
    if (this.captions !== v) this.toggleCaptions();
  }

  /* ---------- selection ---------- */
  select(o: Object3D | null, info: InspectInfo | null = null) {
    // Clicking a part of the room used to open an "Inspect" tab. That tab is gone, so a click no longer selects anything.
    void o;
    void info;
  }

  /* ---------- model on the stage ---------- */
  setParam(k: string, v: number) {
    if (!this.S) return;
    this.S.p[k] = v;
    this.S.reset();
    this.paramsVersion++;
    this.emit(true);
  }
  toggleSim() {
    if (!this.S) return;
    if (this.S.done) this.S.reset();
    this.simPlay = !this.simPlay;
    this.emit(true);
  }
  resetSim() {
    if (!this.S) return;
    this.S.reset();
    this.simPlay = false;
    this.paramsVersion++;
    this.emit(true);
  }

  /* ---------- game ---------- */
  openGame() {
    this.pause();
    this.intro = false;
    this.game = true;
    this.emit(true);
  }
  closeGame() {
    this.game = false;
    this.emit(true);
  }

  /* ---------- speech ---------- */
  stopSpeech() {
    if (!speechAvailable()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  private speakFrom() {
    if (!this.voice || !speechAvailable()) return;
    this.stopSpeech();
    const s = this.topic.slides[this.idx];
    const w = s.say.split(/\s+/);
    const from = Math.floor(clamp(slideProgress(this.tl, this.t, this.idx) / 0.92, 0, 1) * w.length);
    const txt = w.slice(from).join(' ');
    if (!txt) return;
    try {
      const u = new SpeechSynthesisUtterance(txt);
      u.rate = clamp(this.speed, 0.6, 1.6);
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  dispose() {
    this.playing = false;
    this.stopSpeech();
    if (this.minuteAcc > 0) {
      useApp.getState().addMinutes(this.minuteAcc / 60);
      this.minuteAcc = 0;
    }
    this.subs.clear();
  }
}

export { CAM_KEYS };
