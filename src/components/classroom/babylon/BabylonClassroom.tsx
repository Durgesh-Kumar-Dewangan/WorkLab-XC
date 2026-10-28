'use client';

/*
 * The 3D classroom on Babylon.js. Same props and behaviour as the three.js scene (scene/ClassroomCanvas.tsx), which stays as the
 * fallback: a lecture hall with the presentation screen, two whiteboards, the model stage, an orbit camera with safe
 * zoom, the lesson's camera moves, and a frame governor that draws only when something changes.
 *
 * The scene uses Babylon's right-handed mode, so every position, rotation and model matches the three.js scene and the shared
 * measurements in scene/layout.ts.
 */
import { buildHall } from './hall';
import { buildPavilion } from './pavilion';
import { buildCollab } from './collab';
import { buildHallModelRoom, loadHallModel } from './hallModel';
import { useEffect, useRef, type RefObject } from 'react';
import * as B from '@babylonjs/core';
import { useApp } from '@/lib/store';
import '@babylonjs/loaders/glTF';
import type { ClassroomController } from '@/lib/classroom/controller';
import { CAM_PRESETS, formulaText } from '@/lib/classroom/timeline';
import type { Sim } from '@/lib/domain/sim';
import { renderDots, type HalftoneCanvas } from '@/lib/fx/halftone';
import type { Quality } from '@/lib/store/types';
import { clamp, ease } from '@/lib/util';
import { drawBoard, drawSideBoard, type SideContent } from '../scene/boardTexture';
import { BOARD, SCREEN, SLIDE, STAGE, STAGE_Y, boardPose } from '../scene/layout';

export interface BabylonClassroomProps {
  ctrl: ClassroomController;
  quality: Quality;
  panelPx: number;
  halftone: boolean;
  overlay: RefObject<HalftoneCanvas | null>;
  envId: string;
  /** 'built' draws the hall from code; 'model' loads the earlier scanned stage model. */
  hall?: 'built' | 'model' | 'pavilion' | 'forest' | 'collab';
  backdrop?: string;
  onReady: () => void;
  onFail: (reason: string) => void;
}

const BASE_FOV = 46;
const WIDE = 1.5;
const MAX_FOV = 80;
const SHORT_FOV = 62;
const MIN_DIST = 2.4;
const MAX_DIST = 18;
const PAN_BOX = { x: [-7, 7], y: [0.8, 4.6], z: [-5.2, 1] } as const;
const DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
const FPS: Record<Quality, number> = { low: 30, medium: 60, high: 60 };
const ORDER: Quality[] = ['low', 'medium', 'high'];
const deg = (d: number) => (d * Math.PI) / 180;

/** The learner's quality, lowered on weak hardware and capped at Medium on touch screens. */
function deviceQuality(want: Quality): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  let cap: Quality = 'high';
  if (window.matchMedia?.('(pointer: coarse)').matches) cap = 'medium';
  if ((nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 2 || nav.connection?.saveData)
    cap = 'low';
  return ORDER[Math.min(ORDER.indexOf(want), ORDER.indexOf(cap))];
}

/* ------------------------------------------------------------------------------------------------ small builders */
type V3 = [number, number, number];
interface MatOpts {
  rough?: number;
  emissive?: string;
  ei?: number;
  alpha?: number;
  wire?: boolean;
}

function material(scene: B.Scene, color: string, o: MatOpts = {}) {
  const m = new B.StandardMaterial(`m-${color}-${Math.random().toString(36).slice(2, 7)}`, scene);
  m.diffuseColor = B.Color3.FromHexString(color);
  const spec = 0.32 * (1 - (o.rough ?? 0.8));
  m.specularColor = new B.Color3(spec, spec, spec);
  m.specularPower = 32;
  if (o.emissive) m.emissiveColor = B.Color3.FromHexString(o.emissive).scale(Math.min(1, (o.ei ?? 1) * 0.7));
  if (o.alpha !== undefined && o.alpha < 1) m.alpha = o.alpha;
  if (o.wire) m.wireframe = true;
  return m;
}

function box(
  scene: B.Scene,
  size: V3,
  pos: V3,
  color: string,
  parent: B.TransformNode | null,
  o: MatOpts & { cast?: boolean } = {},
  shadow?: B.ShadowGenerator | null,
) {
  const b = B.MeshBuilder.CreateBox('box', { width: size[0], height: size[1], depth: size[2] }, scene);
  b.position.set(...pos);
  b.material = material(scene, color, o);
  b.receiveShadows = true;
  if (parent) b.parent = parent;
  if (shadow && o.cast !== false) shadow.addShadowCaster(b);
  return b;
}

/** A textured plane turned to face +z (toward the audience). */
function screenPlane(scene: B.Scene, name: string, w: number, h: number, pxW: number, pxH: number) {
  const tex = new B.DynamicTexture(`${name}-tex`, { width: pxW, height: pxH }, scene, true);
  tex.anisotropicFilteringLevel = 8;
  tex.hasAlpha = false;
  tex.uScale = -1; // the right-handed scene mirrors the image across the plane; flip it back so text reads correctly
  tex.uOffset = 1;
  const m = new B.StandardMaterial(`${name}-mat`, scene);
  m.diffuseColor = B.Color3.Black();
  m.specularColor = B.Color3.Black();
  m.emissiveTexture = tex;
  m.disableLighting = true;
  m.backFaceCulling = true;
  const p = B.MeshBuilder.CreatePlane(
    name,
    { width: w, height: h, sideOrientation: B.Mesh.FRONTSIDE },
    scene,
  );
  p.material = m;
  p.rotation.y = Math.PI; // Babylon's plane faces -z in this right-handed scene; turn it toward the audience
  return { mesh: p, tex, ctx: tex.getContext() as unknown as CanvasRenderingContext2D, pxW, pxH };
}

/** A line made of a fixed number of points that can be refilled each frame (trails and predicted paths). */
function trail(scene: B.Scene, n: number, color: string, alpha = 1) {
  const pts = Array.from({ length: n }, () => B.Vector3.Zero());
  let line = B.MeshBuilder.CreateLines('trail', { points: pts, updatable: true }, scene);
  line.color = B.Color3.FromHexString(color);
  line.alpha = alpha;
  line.isPickable = false;
  return {
    get mesh() {
      return line;
    },
    set(points: B.Vector3[]) {
      if (!points.length) {
        line.isVisible = false;
        return;
      }
      line.isVisible = true;
      for (let i = 0; i < n; i++)
        pts[i].copyFrom(points[Math.min(points.length - 1, Math.max(0, points.length - n + i))]);
      line = B.MeshBuilder.CreateLines('trail', { points: pts, instance: line }, scene);
    },
  };
}

/** An arrow along +x: a shaft and a head. `set(length, sign)` points it left or right and sets its length. */
function arrow(scene: B.Scene, color: string, parent: B.TransformNode) {
  const root = new B.TransformNode('arrow', scene);
  root.parent = parent;
  const mat = material(scene, color, { emissive: color, ei: 0.8 });
  const shaft = B.MeshBuilder.CreateCylinder('shaft', { diameter: 0.025, height: 1, tessellation: 8 }, scene);
  shaft.rotation.z = -Math.PI / 2;
  shaft.material = mat;
  shaft.parent = root;
  const head = B.MeshBuilder.CreateCylinder(
    'head',
    { diameterTop: 0, diameterBottom: 0.09, height: 0.12, tessellation: 12 },
    scene,
  );
  head.rotation.z = -Math.PI / 2;
  head.material = mat;
  head.parent = root;
  return {
    root,
    set(len: number, sign: number) {
      const L = Math.max(0.14, len);
      shaft.scaling.y = L - 0.12;
      shaft.position.x = (L - 0.12) / 2;
      head.position.x = L - 0.06;
      root.rotation.y = sign < 0 ? Math.PI : 0;
    },
  };
}

/* ------------------------------------------------------------------------------------------------ the rooms */
function buildLab(scene: B.Scene, shadow: B.ShadowGenerator | null) {
  const floor = B.MeshBuilder.CreateGround('floor', { width: 18, height: 16 }, scene);
  floor.material = material(scene, '#12151f', { rough: 0.6 });
  floor.receiveShadows = true;
  box(scene, [18, 4.6, 0.2], [0, 2.3, -5.1], '#0c1020', null, { rough: 0.9, cast: false });
  box(scene, [5, 0.1, 1], [-5.5, STAGE_Y + 0.9, -4.3], '#2a3150', null, { rough: 0.4 }, shadow);
  box(scene, [4.8, 0.85, 0.9], [-5.5, STAGE_Y + 0.42, -4.3], '#161a2c', null, {}, shadow);
  ['#59f286', '#ffb84d', '#d46bff'].forEach((c, i) => {
    const f = B.MeshBuilder.CreateCylinder(
      'flask',
      { diameterTop: 0.2, diameterBottom: 0.28, height: 0.24, tessellation: 14 },
      scene,
    );
    f.position.set(-6.5 + i * 0.5, STAGE_Y + 1.12, -4.3);
    f.material = material(scene, c, { emissive: c, ei: 0.5, alpha: 0.85 });
  });
  for (const x of [-7, 7])
    box(scene, [0.1, 4, 0.1], [x, 2, -5], '#2f7bff', null, { emissive: '#2f7bff', ei: 1, cast: false });
}

function buildVoid(scene: B.Scene) {
  const floor = B.MeshBuilder.CreateGround('floor', { width: 40, height: 40 }, scene);
  floor.material = material(scene, '#0e1018', { rough: 0.6 });
  floor.receiveShadows = true;
  const ring = B.MeshBuilder.CreateTorus(
    'ring',
    { diameter: 11.05, thickness: 0.05, tessellation: 96 },
    scene,
  );
  ring.position.y = 0.02;
  ring.material = material(scene, '#2f7bff', { emissive: '#2f7bff', ei: 1, alpha: 0.5 });
}

/* ------------------------------------------------------------------------------------------------ the model stage */
type Updater = () => void;

function buildStage(
  scene: B.Scene,
  ctrl: ClassroomController,
  shadow: B.ShadowGenerator | null,
): Updater | null {
  const kind = ctrl.topic.demo;
  if (kind === 'concept') return null;
  const stage = new B.TransformNode('demoStage', scene);
  stage.position.set(3.6, STAGE_Y, -2.0);
  box(scene, [3.6, 0.18, 2.6], [0, 0.09, 0], '#1b2036', stage, { rough: 0.4 }, shadow);
  box(scene, [3.64, 0.02, 2.64], [0, 0.185, 0], '#2f7bff', stage, {
    emissive: '#2f7bff',
    ei: 0.9,
    cast: false,
  });
  const g = new B.TransformNode('demo', scene);
  g.parent = stage;
  g.position.y = 0.19;
  const std = (c: string, o: MatOpts = {}) => material(scene, c, { rough: 0.55, ...o });
  let seen = -1;
  const sync = (apply: (S: Sim) => void) => {
    if (ctrl.S && seen !== ctrl.paramsVersion) {
      seen = ctrl.paramsVersion;
      apply(ctrl.S);
    }
  };
  const caster = (m: B.AbstractMesh) => shadow?.addShadowCaster(m);
  const toWorld = (p: V3) => B.Vector3.TransformCoordinates(new B.Vector3(...p), g.computeWorldMatrix(true));

  if (kind === 'cart') {
    box(scene, [3.2, 0.04, 0.34], [0, 0.02, 0], '#2a2f45', g);
    for (let i = -5; i <= 5; i++)
      box(scene, [0.01, 0.045, 0.34], [i * 0.28, 0.022, 0], '#59627f', g, { cast: false });
    const cart = new B.TransformNode('cart', scene);
    cart.parent = g;
    const body = B.MeshBuilder.CreateBox('cartBody', { width: 0.4, height: 0.18, depth: 0.26 }, scene);
    body.parent = cart;
    body.position.y = 0.17;
    body.material = std('#2f7bff');
    caster(body);
    const wheels = (
      [
        [-0.14, -0.14],
        [0.14, -0.14],
        [-0.14, 0.14],
        [0.14, 0.14],
      ] as const
    ).map(([x, z]) => {
      const w = B.MeshBuilder.CreateCylinder(
        'wheel',
        { diameter: 0.1, height: 0.04, tessellation: 16 },
        scene,
      );
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 0.07, z * 1.08);
      w.parent = cart;
      w.material = std('#e8eefc');
      return w;
    });
    const fa = arrow(scene, '#59f286', cart);
    const fr = arrow(scene, '#ff6b7a', cart);
    return () => {
      const S = ctrl.S;
      if (!S) return;
      cart.position.x = S.s.x * 0.13;
      const m = 0.3 + S.p.mass * 0.035;
      body.scaling.x = m / 0.4;
      wheels.forEach((w) => (w.rotation.y = -S.s.x * 5));
      const F = S.p.force;
      fa.root.setEnabled(Math.abs(F) > 0.01);
      fa.set(Math.abs(F) * 0.035 + 0.1, Math.sign(F));
      fa.root.position.set((Math.sign(F) * m) / 2, 0.4, 0);
      const f = S.s.fr || 0;
      fr.root.setEnabled(Math.abs(f) > 0.01);
      fr.set(Math.abs(f) * 0.035 + 0.1, Math.sign(f));
      fr.root.position.set(Math.sign(f) * (m / 2), 0.25, 0.2);
    };
  }
  if (kind === 'projectile') {
    const x0 = -1.5;
    let sc = 0.05;
    box(scene, [3.4, 0.03, 0.5], [0, 0.015, 0], '#2a2f45', g);
    const cannon = B.MeshBuilder.CreateCylinder(
      'cannon',
      { diameterTop: 0.1, diameterBottom: 0.14, height: 0.4, tessellation: 14 },
      scene,
    );
    cannon.parent = g;
    cannon.material = std('#59627f');
    caster(cannon);
    const ball = B.MeshBuilder.CreateSphere('ball', { diameter: 0.12, segments: 12 }, scene);
    ball.parent = g;
    ball.material = std('#ffb84d', { emissive: '#ffb84d', ei: 0.35 });
    caster(ball);
    const path = trail(scene, 420, '#2f7bff');
    const pred = trail(scene, 61, '#8a8a99', 0.55);
    return () => {
      sync((S) => {
        const p = S.p;
        const R = Math.max(10, ((p.speed * p.speed * Math.sin(2 * deg(p.angle))) / p.gravity) * 1.1);
        const H = Math.max(3, (Math.pow(p.speed * Math.sin(deg(p.angle)), 2) / (2 * p.gravity)) * 1.2);
        sc = Math.min(3 / R, 1.6 / H);
        cannon.position.set(x0, 0.1, 0);
        cannon.rotation.z = -(Math.PI / 2 - deg(p.angle));
        const T = (2 * p.speed * Math.sin(deg(p.angle))) / p.gravity;
        const pts: B.Vector3[] = [];
        for (let i = 0; i <= 60; i++) {
          const t = (T * i) / 60;
          pts.push(
            toWorld([
              x0 + p.speed * Math.cos(deg(p.angle)) * t * sc,
              0.05 + (p.speed * Math.sin(deg(p.angle)) * t - (p.gravity * t * t) / 2) * sc,
              0,
            ]),
          );
        }
        pred.set(pts);
      });
      const S = ctrl.S;
      if (!S) return;
      ball.position.set(x0 + S.s.x * sc, 0.05 + S.s.y * sc, 0);
      path.set(S.trail.map((q) => toWorld([x0 + q[0] * sc, 0.05 + q[1] * sc, 0])));
    };
  }
  if (kind === 'pendulum') {
    box(scene, [1.3, 0.05, 0.3], [0, 1.9, 0], '#59627f', g);
    box(scene, [0.05, 1.9, 0.05], [-0.62, 0.95, 0], '#59627f', g);
    box(scene, [0.05, 1.9, 0.05], [0.62, 0.95, 0], '#59627f', g);
    const piv = new B.TransformNode('pivot', scene);
    piv.parent = g;
    piv.position.set(0, 1.86, 0);
    const rod = B.MeshBuilder.CreateCylinder('rod', { diameter: 0.016, height: 1, tessellation: 6 }, scene);
    rod.parent = piv;
    rod.material = std('#e8eefc');
    const bob = B.MeshBuilder.CreateSphere('bob', { diameter: 0.2, segments: 16 }, scene);
    bob.parent = piv;
    bob.material = std('#7c4dff', { rough: 0.35 });
    caster(bob);
    const path = trail(scene, 300, '#7c4dff', 0.6);
    let len = 1;
    return () => {
      sync((S) => {
        len = 0.6 + S.p.length * 0.42;
        rod.scaling.y = len;
        rod.position.y = -len / 2;
      });
      const S = ctrl.S;
      if (!S) return;
      piv.rotation.z = -S.s.th;
      bob.position.set(0, -len, 0);
      const k = len / S.p.length;
      path.set(S.trail.map((q) => toWorld([q[0] * k, 1.86 + q[1] * k, 0])));
    };
  }
  if (kind === 'orbit') {
    const su = 0.2;
    const star = B.MeshBuilder.CreateSphere('star', { diameter: 2, segments: 24 }, scene);
    star.parent = g;
    star.position.y = 0.8;
    star.material = std('#ffb84d', { emissive: '#ffb84d', ei: 0.9 });
    const glow = new B.PointLight('starLight', new B.Vector3(0, 0.8, 0), scene);
    glow.parent = g;
    glow.diffuse = B.Color3.FromHexString('#ffd8a0');
    glow.intensity = 0.8;
    glow.range = 4;
    const sat = B.MeshBuilder.CreateSphere('sat', { diameter: 0.12, segments: 12 }, scene);
    sat.parent = g;
    sat.material = std('#e8eefc');
    const ring = B.MeshBuilder.CreateTorus(
      'orbitRing',
      { diameter: 2, thickness: 0.008, tessellation: 64 },
      scene,
    );
    ring.parent = g;
    ring.position.y = 0.8;
    ring.material = material(scene, '#59627f', { alpha: 0.5 });
    const path = trail(scene, 700, '#2f7bff');
    return () => {
      sync((S) => {
        star.scaling.setAll(0.11 + S.p.orbitMass / 700);
        ring.scaling.setAll(S.p.radius * su);
      });
      const S = ctrl.S;
      if (!S) return;
      sat.setEnabled(!S.s.crashed);
      sat.position.set(S.s.x * su, 0.8, -S.s.y * su);
      path.set(S.trail.map((q) => toWorld([q[0] * su, 0.8, -q[1] * su])));
    };
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------ the component */
export default function BabylonClassroom(props: BabylonClassroomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { ctrl, envId, onReady, onFail } = live.current;
    const quality = deviceQuality(live.current.quality);
    let engine: B.Engine;
    try {
      engine = new B.Engine(
        canvas,
        quality !== 'low',
        {
          preserveDrawingBuffer: false,
          stencil: false,
          antialias: quality === 'high',
          powerPreference: quality === 'low' ? 'low-power' : 'high-performance',
          doNotHandleContextLost: false,
        },
        false,
      );
    } catch {
      onFail('The 3D engine could not start on this device.');
      return;
    }
    B.SceneLoaderFlags.ShowLoadingScreen = false;
    const devDpr = Math.min(window.devicePixelRatio || 1, DPR[quality]);
    let pixelScale = 1;
    engine.setHardwareScalingLevel(1 / Math.max(0.65, devDpr * pixelScale));

    const scene = new B.Scene(engine);
    scene.useRightHandedSystem = true;
    const bg = envId === 'classroom' ? '#0b0c14' : '#07080f';
    scene.clearColor = B.Color4.FromHexString(`${bg}ff`);
    scene.fogMode = B.Scene.FOGMODE_LINEAR;
    scene.fogStart = 16;
    scene.fogEnd = 34;
    scene.fogColor = B.Color3.FromHexString('#07080f');
    if (
      envId === 'classroom' &&
      (live.current.hall === 'pavilion' || live.current.hall === 'forest' || live.current.hall === 'collab')
    ) {
      // daylight: a sky-blue horizon and no fog, so the mountains stay clear
      scene.clearColor = B.Color4.FromHexString('#8fc6f0ff');
      scene.fogMode = B.Scene.FOGMODE_NONE;
    }
    scene.skipPointerMovePicking = true;
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 0.3;

    // lights: sky and ground, a warm key light with shadows, a cool spot on the screen, and fill lights on High only
    const hemi = new B.HemisphericLight('sky', new B.Vector3(0, 1, 0), scene);
    hemi.diffuse = B.Color3.FromHexString('#bfd0ff');
    hemi.groundColor = B.Color3.FromHexString('#2a1d14');
    hemi.intensity = envId === 'classroom' ? 0.85 : 0.9;
    const key = new B.DirectionalLight('key', new B.Vector3(-4, -7, -8).normalize(), scene);
    key.position = new B.Vector3(4, 8, 6);
    key.diffuse = B.Color3.FromHexString('#fff1dc');
    key.intensity = 1.2;
    let shadow: B.ShadowGenerator | null = null;
    if (quality !== 'low') {
      shadow = new B.ShadowGenerator(quality === 'high' ? 2048 : 1024, key);
      shadow.usePercentageCloserFiltering = true;
      shadow.bias = 0.0006;
      shadow.getShadowMap()!.refreshRate = 1;
    }
    if (quality !== 'low') {
      const spot = new B.SpotLight(
        'screenSpot',
        new B.Vector3(0, 4.2, 1.5),
        new B.Vector3(0, -2, -6.3).normalize(),
        1.2,
        2,
        scene,
      );
      spot.diffuse = B.Color3.FromHexString('#dbe6ff');
      spot.intensity = 1.1;
      spot.range = 14;
    }
    if (quality === 'high')
      for (const p of [
        [-4, 4, 0],
        [4, 4, 0],
        [0, 4, 4],
      ] as V3[]) {
        const l = new B.PointLight('fill', new B.Vector3(...p), scene);
        l.diffuse = B.Color3.FromHexString('#ffd9a8');
        l.intensity = 0.35;
        l.range = 12;
      }

    // the room
    if (envId === 'lab') buildLab(scene, shadow);
    else if (envId === 'void') buildVoid(scene);
    else if (live.current.hall === 'model') buildHallModelRoom(scene, shadow);
    else if (live.current.hall === 'collab')
      buildCollab(scene, shadow, quality, live.current.backdrop ?? 'queue');
    else if (live.current.hall === 'pavilion' || live.current.hall === 'forest')
      buildPavilion(
        scene,
        shadow,
        quality,
        live.current.hall === 'forest' ? 'forest' : 'ridge',
        live.current.backdrop ?? 'queue',
      );
    else buildHall(scene, shadow, quality);
    if (envId !== 'classroom')
      box(scene, [STAGE.w, STAGE_Y, STAGE.d], [0, STAGE_Y / 2, STAGE.z], '#1b2036', null, { rough: 0.4 });

    // the presentation screen and the two whiteboards
    const screen = screenPlane(scene, 'screen', SLIDE.w, SLIDE.h, 1800, 900);
    screen.mesh.position.set(SCREEN.x, SCREEN.y, SLIDE.z);
    if (envId !== 'classroom')
      box(
        scene,
        [SLIDE.w + 0.4, SLIDE.h + 0.4, 0.12],
        [SCREEN.x, SCREEN.y, SLIDE.z - 0.07],
        '#1b1f33',
        null,
        { rough: 0.4 },
      );
    const sides = ([-1, 1] as const).map((side) => {
      const f = screenPlane(scene, `board${side}`, BOARD.face.w, BOARD.face.h, 1320, 620);
      const { pos, rotY } = boardPose(side);
      const g = new B.TransformNode('boardface', scene);
      g.position.set(...pos);
      g.rotation.y = rotY;
      f.mesh.parent = g;
      f.mesh.position.z = 0.08;
      return f;
    });
    let boardKey = '';
    let sideIdx = -1;
    const drawBoards = () => {
      const d = ctrl.boardData();
      const k = `${d.idx}|${d.reveal.map((a) => Math.round(a * 4)).join('')}|${Math.round(d.formulaAlpha * 4)}|${Math.round(d.progress * 200)}|${d.photo ? 1 : 0}`;
      if (k !== boardKey) {
        boardKey = k;
        drawBoard(screen.ctx, screen.pxW, screen.pxH, d);
        screen.tex.update(true);
      }
      if (d.idx !== sideIdx) {
        sideIdx = d.idx;
        const s = ctrl.topic.slides[d.idx];
        const say: SideContent = s?.say ? { kind: 'say', head: 'In words', text: s.say } : { kind: 'blank' };
        const fx = s?.f && formulaText(s.f);
        const right: SideContent = s?.check
          ? { kind: 'question', head: 'Question', text: s.check.q, opts: s.check.opts }
          : fx
            ? { kind: 'formula', head: 'Formula', text: fx }
            : { kind: 'blank' };
        drawSideBoard(sides[0].ctx, sides[0].pxW, sides[0].pxH, say);
        sides[0].tex.update(true);
        drawSideBoard(sides[1].ctx, sides[1].pxW, sides[1].pxH, right);
        sides[1].tex.update(true);
      }
    };

    // anti-aliasing and a soft glow on the lit ceiling strips and the screen
    let pipeline: B.DefaultRenderingPipeline | null = null;
    const mkPipeline = () => {
      if (quality === 'low') return;
      pipeline = new B.DefaultRenderingPipeline('wlxc', false, scene, [cam]);
      pipeline.fxaaEnabled = quality === 'medium';
      pipeline.samples = quality === 'high' ? 4 : 1;
      pipeline.bloomEnabled = true;
      pipeline.bloomThreshold = 0.9;
      pipeline.bloomWeight = quality === 'high' ? 0.28 : 0.2;
      pipeline.bloomKernel = quality === 'high' ? 56 : 32;
      pipeline.bloomScale = 0.5;
      pipeline.imageProcessingEnabled = false; // tone mapping and exposure stay on the scene
    };

    // the model stage
    const stageTick = buildStage(scene, ctrl, shadow);

    // camera: orbit with safe limits, the lesson's camera moves and the zoom buttons
    const cam = new B.ArcRotateCamera('cam', 0, 1, 8, new B.Vector3(0, 2.9, -4.8), scene);
    cam.minZ = 0.1;
    cam.maxZ = 80;
    cam.lowerRadiusLimit = MIN_DIST;
    cam.upperRadiusLimit = MAX_DIST;
    cam.lowerBetaLimit = Math.PI * 0.12;
    cam.upperBetaLimit = Math.PI * 0.52;
    cam.wheelDeltaPercentage = 0.01;
    cam.pinchDeltaPercentage = 0.004;
    cam.panningSensibility = 600;
    cam.angularSensibilityX = cam.angularSensibilityY = 1400;
    cam.inertia = 0.88;
    cam.attachControl(canvas, true);
    mkPipeline();
    const place = (pos: B.Vector3, tgt: B.Vector3) => {
      cam.setTarget(tgt);
      cam.setPosition(pos);
    };
    const preset = (name: keyof typeof CAM_PRESETS) => CAM_PRESETS[name];
    const b0 = preset('board');
    place(new B.Vector3(...b0.pos), new B.Vector3(...b0.tgt));
    cam.lowerAlphaLimit = cam.alpha - 1.25;
    cam.upperAlphaLimit = cam.alpha + 1.25;

    interface Tween {
      t: number;
      dur: number;
      fp: B.Vector3;
      ft: B.Vector3;
      pos: B.Vector3;
      tgt: B.Vector3;
    }
    let tween: Tween | null = null;
    let camSeq = -1;
    let zoomSeq = ctrl.zoomRequest.seq;
    scene.onPointerObservable.add((pi) => {
      if (pi.type === B.PointerEventTypes.POINTERDOWN || pi.type === B.PointerEventTypes.POINTERWHEEL) {
        tween = null;
        ctrl.userCamera();
        wake(1500);
      }
    });

    const fit = () => {
      const w = engine.getRenderWidth() * engine.getHardwareScalingLevel();
      const h = engine.getRenderHeight() * engine.getHardwareScalingLevel();
      const panel = live.current.panelPx && w > 900 ? live.current.panelPx : 0;
      const vw = w - panel;
      // slide the view left so the scene centres in the space the side panel leaves
      const worldW = 2 * cam.radius * Math.tan(cam.fov / 2) * (w / Math.max(1, h));
      cam.targetScreenOffset.x = panel ? -(worldW * (panel / w)) / 2 : 0;
      const aspect = vw / Math.max(1, h);
      const half = Math.tan(deg(BASE_FOV / 2));
      let fov =
        aspect >= WIDE
          ? BASE_FOV
          : Math.min(MAX_FOV, (2 * Math.atan((half * WIDE) / aspect) * 180) / Math.PI);
      if (h < 520) fov = Math.max(fov, SHORT_FOV);
      cam.fov = deg(fov);
    };

    const camStep = (dt: number) => {
      const req = ctrl.camRequest;
      if (req.seq !== camSeq) {
        camSeq = req.seq;
        const p = preset(req.name);
        const pos = new B.Vector3(...p.pos);
        const tgt = new B.Vector3(...p.tgt);
        if (req.instant || ctrl.reduced) {
          place(pos, tgt);
          tween = null;
        } else tween = { t: 0, dur: 1.1, fp: cam.position.clone(), ft: cam.target.clone(), pos, tgt };
      }
      const z = ctrl.zoomRequest;
      if (z.seq !== zoomSeq) {
        zoomSeq = z.seq;
        const off = cam.position.subtract(cam.target);
        const len = clamp(off.length() * z.factor, MIN_DIST, MAX_DIST);
        const pos = cam.target.add(off.normalize().scale(len));
        if (ctrl.reduced) place(pos, cam.target.clone());
        else
          tween = {
            t: 0,
            dur: 0.28,
            fp: cam.position.clone(),
            ft: cam.target.clone(),
            pos,
            tgt: cam.target.clone(),
          };
      }
      if (tween) {
        tween.t += Math.min(dt, 0.05) / tween.dur;
        const k = ease(clamp(tween.t, 0, 1));
        place(B.Vector3.Lerp(tween.fp, tween.pos, k), B.Vector3.Lerp(tween.ft, tween.tgt, k));
        if (tween.t >= 1) tween = null;
      }
      // panning can never carry the view away from the stage
      const t = cam.target;
      const cx = clamp(t.x, PAN_BOX.x[0], PAN_BOX.x[1]);
      const cy = clamp(t.y, PAN_BOX.y[0], PAN_BOX.y[1]);
      const cz = clamp(t.z, PAN_BOX.z[0], PAN_BOX.z[1]);
      if (cx !== t.x || cy !== t.y || cz !== t.z) cam.setTarget(new B.Vector3(cx, cy, cz));
    };

    // frame governor: draw at full rate while something moves, a few frames a second when still, none when hidden
    let until = performance.now() + 2600;
    const wake = (ms = 1500) => {
      until = Math.max(until, performance.now() + ms);
    };
    let visible = true;
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => void (visible = e.isIntersecting))
        : null;
    io?.observe(canvas);
    let prevSnap = ctrl.getSnapshot() as unknown as Record<string, unknown>;
    const offSub = ctrl.subscribe(() => {
      const cur = ctrl.getSnapshot() as unknown as Record<string, unknown>;
      if (Object.keys(cur).some((k) => typeof cur[k] !== 'object' && cur[k] !== prevSnap[k])) wake(700);
      prevSnap = cur;
    });
    const fps = FPS[quality];
    let last = 0;
    let firstFrame = 0;
    let frames = 0;
    let lastT = performance.now();
    let slowSince = 0;
    let haloCount = 0;
    const halo = document.createElement('canvas');
    halo.width = 320;
    halo.height = 180;
    const haloCtx = halo.getContext('2d')!;

    const frame = (force = false) => {
      const now = performance.now();
      if (!force && (document.hidden || !visible)) return;
      if (ctrl.talking || ctrl.playing) wake(300);
      const gap = now < until || tween ? 1000 / fps : 125;
      if (!force && now - last < gap - 3) return;
      last = now;
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      ctrl.tick(dt);
      camStep(dt);
      drawBoards();
      stageTick?.();
      // exposure fades up over 1.5 s from the first drawn frame, however slow that frame is
      if (!firstFrame) firstFrame = now;
      ip.exposure =
        (useApp.getState().settings.exposure ?? 1) *
        (0.3 + 0.7 * ease(clamp((now - firstFrame) / 1500, 0, 1)));
      // shadows only need redrawing when something moves
      const sm = shadow?.getShadowMap();
      if (sm) sm.refreshRate = ctrl.talking || frames < 90 || stageTick ? 1 : 6;
      frames++;
      scene.render();
      // the halftone view: every third frame, redraw the image as dots on the overlay canvas
      const o = live.current.overlay.current;
      if (live.current.halftone && o && haloCount++ % 3 === 0) {
        try {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          if (o.width !== Math.round(canvas.clientWidth * dpr)) {
            o._dpr = dpr;
            o.width = Math.round(canvas.clientWidth * dpr);
            o.height = Math.round(canvas.clientHeight * dpr);
          }
          haloCtx.drawImage(canvas, 0, 0, 320, 180);
          renderDots(o, halo, { pitch: 6, gamma: 0.9, cut: 0.06, fadeX: 0, color: '#ffffff' });
        } catch {
          /* unreadable for a moment while resizing */
        }
      }
      // lower the pixel density if the device cannot keep up, raise it again when it can
      if (now < until && engine.getFps() < 26) {
        if (!slowSince) slowSince = now;
        if (now - slowSince > 2000 && pixelScale > 0.65) {
          pixelScale = Math.max(0.65, +(pixelScale - 0.15).toFixed(2));
          engine.setHardwareScalingLevel(1 / Math.max(0.65, devDpr * pixelScale));
          slowSince = 0;
        }
      } else slowSince = 0;
    };
    engine.runRenderLoop(() => frame());

    // the studio layout can switch parts of the scene on and off
    const onLayer = (e: Event) => {
      const { id, visible } = (e as CustomEvent<{ id: string; visible: boolean }>).detail;
      const byName = (...names: string[]) => scene.meshes.filter((m) => names.includes(m.name));
      const nodes: (B.TransformNode | B.AbstractMesh)[] =
        id === 'screen'
          ? byName('screen')
          : id === 'boardLeft'
            ? byName('board-1')
            : id === 'boardRight'
              ? byName('board1')
              : id === 'scenery'
                ? byName('backdrop')
                : id === 'demo'
                  ? [scene.getTransformNodeByName('demoStage')].filter((n): n is B.TransformNode => !!n)
                  : [];
      nodes.forEach((n) => n.setEnabled(visible));
      wake(800);
    };
    window.addEventListener('wlxc-layer', onLayer);

    // development only: lets the console inspect the scene (for example, read pixels to check it is not black)
    if (process.env.NODE_ENV !== 'production')
      (window as unknown as { __wlxcBjs?: unknown }).__wlxcBjs = {
        engine,
        scene,
        cam,
        draw: drawBoards,
        step: () => frame(true),
      };

    // sizes and the side panel
    fit();
    const ro = new ResizeObserver(() => {
      engine.resize();
      fit();
      wake(600);
    });
    ro.observe(canvas);
    const onVis = () => wake(800);
    document.addEventListener('visibilitychange', onVis);
    const lost = () => live.current.onFail('The graphics context was lost.');
    engine.onContextLostObservable.add(lost);
    canvas.style.cursor = 'grab';

    // models arrive in the background; the room shows as soon as the hall is in
    let cancelled = false;
    (async () => {
      try {
        if (envId === 'classroom' && live.current.hall === 'model') await loadHallModel(scene);
      } catch (e) {
        console.warn('Hall model could not load', e);
      }
      if (cancelled) return;
      onReady();
      scene.freezeMaterials();
      scene.performancePriority = B.ScenePerformancePriority.Intermediate;
      wake(2600);
    })();

    return () => {
      cancelled = true;
      offSub();
      io?.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('wlxc-layer', onLayer);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    };
    // the scene is built once per room and quality; everything else is read live from the controller
  }, [props.envId, props.quality, props.hall, props.backdrop]); // eslint-disable-line react-hooks/exhaustive-deps

  // the side panel changes the visible width
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [props.panelPx]);

  return (
    <canvas
      ref={canvasRef}
      className="cr-canvas"
      role="img"
      aria-label="3D classroom with a presentation screen, two boards and a physics model. Drag to orbit, scroll or pinch to zoom."
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        outline: 'none',
        touchAction: 'none',
      }}
    />
  );
}
