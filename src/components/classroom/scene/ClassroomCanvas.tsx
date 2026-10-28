'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import type { ClassroomController } from '@/lib/classroom/controller';
import type { HalftoneCanvas } from '@/lib/fx/halftone';
import type { Quality } from '@/lib/store/types';
import { clamp, ease } from '@/lib/util';
import { Board } from './Board';
import { CameraRig } from './CameraRig';
import { EnvSlot } from './EnvSlot';
import { HalftoneBridge } from './HalftoneBridge';
import { SelectionBox } from './Selection';
import { Stage } from './Stage';

export interface ClassroomCanvasProps {
  ctrl: ClassroomController;
  quality: Quality;
  /** Used by the Babylon.js classroom only; this build has one hall. */
  hall?: 'built' | 'model' | 'pavilion' | 'forest' | 'collab';
  backdrop?: string;
  panelPx: number;
  halftone: boolean;
  overlay: RefObject<HalftoneCanvas | null>;
  envId: string;
  onReady: () => void;
  onFail: (reason: string) => void;
}

const DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
/** Frames a second while something is moving. A still classroom is drawn far less often (see Governor). */
const FPS: Record<Quality, number> = { low: 30, medium: 60, high: 60 };
const ORDER: Quality[] = ['low', 'medium', 'high'];

/**
 * The quality the device can sensibly carry: the learner's choice, lowered on weak hardware (few cores, little memory,
 * data saver) and capped at Medium on phones and tablets, whose high pixel density costs the most for the least gain.
 */
function deviceQuality(want: Quality): Quality {
  if (typeof navigator === 'undefined') return want;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  let cap: Quality = 'high';
  if (window.matchMedia?.('(pointer: coarse)').matches) cap = 'medium';
  if ((nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2 || nav.connection?.saveData)
    cap = 'low';
  return ORDER[Math.min(ORDER.indexOf(want), ORDER.indexOf(cap))];
}
const HEMI: Record<string, number> = { classroom: 1.9, lab: 1.4, void: 1.55 };

/**
 * Drives the lesson clock from R3F's loop and fades the exposure up over the first 1.5 s. The fade is timed on the wall
 * clock from the first frame that is drawn, so a slow first frame (shader compile, a large model) can neither skip it nor
 * stretch it: the scene is always fully lit within 1.5 s of appearing, however slow the frames are.
 */
function Driver({ ctrl }: { ctrl: ClassroomController }) {
  const start = useRef(0);
  const frame = useRef(0);
  useFrame(({ gl }, dt) => {
    ctrl.tick(Math.min(dt, 0.05));
    // Shadows only change when something in the room moves, so redraw the shadow map then (and for the first frames), not every frame
    gl.shadowMap.autoUpdate = false;
    const f = frame.current++;
    if (ctrl.talking || f < 90 || f % 6 === 0) gl.shadowMap.needsUpdate = true;
    const now = performance.now();
    if (!start.current) start.current = now;
    gl.toneMappingExposure = 1.08 * (0.3 + 0.7 * ease(clamp((now - start.current) / 1500, 0, 1)));
  });
  return null;
}

/**
 * Draws a frame only when one is needed. While the lesson plays, the camera is being moved or the
 * learner is touching the scene it draws at the frame rate for the chosen quality; when everything is still it drops to a
 * few frames a second, which cuts the GPU work (and battery use) by about 90% without anything looking frozen.
 * It also draws nothing while the tab is hidden or the classroom is scrolled out of view.
 */
function Governor({ ctrl, fps }: { ctrl: ClassroomController; fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const el = useThree((s) => s.gl.domElement);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let seq = '';
    let visible = true;
    let until = performance.now() + 2600; // the first moments: fade-in, shader compile, model arrival
    const wake = (ms = 1500) => {
      until = Math.max(until, performance.now() + ms);
    };
    const events = ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'touchstart', 'touchmove'];
    const poke = () => wake();
    events.forEach((e) => el.addEventListener(e, poke, { passive: true }));
    // the controller reports about four times a second even when nothing changed, so only a real change wakes the scene
    let prev = ctrl.getSnapshot() as unknown as Record<string, unknown>;
    const off = ctrl.subscribe(() => {
      const cur = ctrl.getSnapshot() as unknown as Record<string, unknown>;
      // compare plain values only: nested objects are rebuilt on every report even when nothing changed
      const changed = Object.keys(cur).some((k) => typeof cur[k] !== 'object' && cur[k] !== prev[k]);
      prev = cur;
      if (changed) wake(700);
    });
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => void (visible = e.isIntersecting))
        : null;
    io?.observe(el);
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !visible) return;
      const s = `${ctrl.camRequest.seq}:${ctrl.zoomRequest.seq}`;
      if (s !== seq) {
        seq = s;
        wake(2000);
      }
      if (ctrl.talking) wake(300);
      const gap = t < until ? 1000 / fps : 125;
      if (t - last >= gap - 3) {
        last = t;
        invalidate();
      }
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => wake(800);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      events.forEach((e) => el.removeEventListener(e, poke));
      document.removeEventListener('visibilitychange', onVis);
      off();
      io?.disconnect();
    };
  }, [ctrl, el, fps, invalidate]);
  return null;
}

function Lights({ quality, envId }: { quality: Quality; envId: string }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const shadows = quality !== 'low';
  useEffect(() => {
    key.current?.target.position.set(0, 1, -2);
    key.current?.target.updateMatrixWorld();
    spot.current?.target.position.set(0, 2.2, -4.8);
    spot.current?.target.updateMatrixWorld();
  }, []);
  const map = quality === 'high' ? 2048 : 1024;
  return (
    <>
      <hemisphereLight args={[0xbfd0ff, 0x2a1d14, HEMI[envId] ?? 1.9]} />
      <directionalLight
        ref={key}
        position={[4, 8, 6]}
        intensity={2.8}
        color={0xfff1dc}
        castShadow={shadows}
        shadow-mapSize={[map, map]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={8}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-bias={-0.0004}
      />
      {/* every extra light is paid for on every pixel: the fill lights are for High only, and Low keeps just sun + sky */}
      {(quality === 'high'
        ? ([
            [-4, 4, 0],
            [4, 4, 0],
            [0, 4, 4],
          ] as const)
        : []
      ).map((p) => (
        <pointLight
          key={p.join()}
          position={p}
          color={0xffd9a8}
          intensity={1.1}
          distance={12}
          decay={1}
        />
      ))}
      {quality !== 'low' ? (
        <spotLight
          ref={spot}
          position={[0, 4.2, 1.5]}
          color={0xdbe6ff}
          intensity={4}
          distance={14}
          angle={0.6}
          penumbra={0.6}
          decay={1}
        />
      ) : null}
    </>
  );
}

function Contents(p: ClassroomCanvasProps) {
  const ready = useRef({ env: false, fired: false });
  const gl = useThree((s) => s.gl);
  const check = useCallback(() => {
    const r = ready.current;
    if (r.env && !r.fired) {
      r.fired = true;
      p.onReady();
    }
  }, [p]);
  const envReady = useCallback(() => {
    ready.current.env = true;
    check();
  }, [check]);

  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      p.onFail('The graphics context was lost.');
    };
    el.addEventListener('webglcontextlost', lost);
    el.style.cursor = 'grab';
    return () => el.removeEventListener('webglcontextlost', lost);
  }, [gl, p]);

  const bg = p.envId === 'classroom' ? '#0b0c14' : '#07080f';
  return (
    <>
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={['#07080f', 16, 34]} />
      <Driver ctrl={p.ctrl} />
      <Lights quality={p.quality} envId={p.envId} />
      <EnvSlot ctrl={p.ctrl} id={p.envId} onReady={envReady} />
      <Board ctrl={p.ctrl} envId={p.envId} />
      <Stage ctrl={p.ctrl} />
      <Suspense fallback={null}></Suspense>
      <CameraRig ctrl={p.ctrl} panelPx={p.panelPx} />
      <SelectionBox ctrl={p.ctrl} />
      {p.halftone ? <HalftoneBridge overlay={p.overlay} /> : null}
    </>
  );
}

/** The 3D classroom. Loaded with next/dynamic (ssr: false) so three.js only ships when a lesson opens. */
export default function ClassroomCanvas(props: ClassroomCanvasProps) {
  const { ctrl } = props;
  const quality = useMemo(() => deviceQuality(props.quality), [props.quality]);
  const down = useRef<[number, number] | null>(null);
  // the pixel scale steps down on its own if the device cannot hold its frame rate, and back up when it can
  const [scale, setScale] = useState(1);
  const dpr = useMemo(() => {
    const dev = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    return Math.max(0.65, Math.min(dev, DPR[quality]) * scale);
  }, [quality, scale]);
  return (
    <Canvas
      frameloop="demand"
      role="img"
      aria-label="3D classroom with a presentation screen, two boards and a physics model. Drag to orbit, scroll to zoom."
      className="cr-canvas"
      style={{ position: 'absolute', inset: 0 }}
      shadows={quality !== 'low' ? 'soft' : false}
      dpr={dpr}
      camera={{ fov: 46, near: 0.1, far: 80, position: [0, 2.7, 4.4] }}
      gl={{
        antialias: quality === 'high',
        powerPreference: quality === 'low' ? 'low-power' : 'high-performance',
        stencil: false,
        alpha: false,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.3,
      }}
      onPointerDown={(e) => void (down.current = [e.clientX, e.clientY])}
      onPointerMissed={(e) => {
        const d = down.current;
        if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 5) return;
        if (ctrl.selected) ctrl.select(null);
      }}
      onCreated={({ gl }) => {
        gl.setClearColor('#07080f');
      }}
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => setScale((s) => Math.max(0.65, +(s - 0.15).toFixed(2)))}
        onIncline={() => setScale((s) => Math.min(1, +(s + 0.1).toFixed(2)))}
      />
      <Governor ctrl={ctrl} fps={FPS[quality]} />
      <Contents {...props} quality={quality} />
    </Canvas>
  );
}
