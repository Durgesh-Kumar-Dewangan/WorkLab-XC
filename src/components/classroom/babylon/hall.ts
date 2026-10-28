import * as B from '@babylonjs/core';
import { BOARD, SCREEN, STAGE_Y, WALL_Z, WING, boardPose } from '../scene/layout';

/**
 * The lecture hall, built entirely from code: a raised stage with a chamfered dark front and glowing edge, stairs with rails,
 * a stone-panelled room with warm wood wings that hold the screen and two boards, a lectern, and a ceiling with light lines,
 * downlights and a hanging projector. Every texture is drawn on a canvas, so the hall needs no model files.
 */

const ROOM = { x: 10, h: 6.5, zBack: -5, zFront: 14 };
const STAGE_FRONT = 1.8;
const STAGE_HALF = 7.4;

type V3 = [number, number, number];

/** A canvas texture drawn once. */
export function canvasTex(scene: B.Scene, name: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, u = 1, v = 1) {
  const t = new B.DynamicTexture(name, { width: w, height: h }, scene, true);
  draw(t.getContext() as unknown as CanvasRenderingContext2D);
  t.update(true);
  t.wrapU = B.Texture.WRAP_ADDRESSMODE;
  t.wrapV = B.Texture.WRAP_ADDRESSMODE;
  t.uScale = u;
  t.vScale = v;
  t.anisotropicFilteringLevel = 8;
  return t;
}

/** Seeded noise so the hall looks the same on every load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function lightWood(c: CanvasRenderingContext2D) {
  const r = rng(9);
  c.fillStyle = '#5b3a1f';
  c.fillRect(0, 0, 512, 512);
  const n = 20;
  const w = 512 / n;
  for (let i = 0; i < n; i++) {
    const t = 0.88 + r() * 0.26;
    c.fillStyle = `rgb(${176 * t},${112 * t},${58 * t})`;
    c.fillRect(i * w + 1.5, 0, w - 3, 512);
    c.strokeStyle = 'rgba(96,56,24,0.3)';
    for (let k = 0; k < 5; k++) {
      const x = i * w + 3 + r() * (w - 6);
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + (r() - 0.5) * 3, 512);
      c.stroke();
    }
  }
}

export function floorBoards(c: CanvasRenderingContext2D) {
  const r = rng(21);
  c.fillStyle = '#2e1d12';
  c.fillRect(0, 0, 512, 512);
  const rows = 8;
  const h = 512 / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * 200;
    while (x < 512) {
      const len = 180 + r() * 220;
      const tone = 0.8 + r() * 0.3;
      c.fillStyle = `rgb(${118 * tone},${80 * tone},${52 * tone})`;
      c.fillRect(x + 1.5, i * h + 1.5, len - 3, h - 3);
      c.strokeStyle = 'rgba(50,30,16,0.28)';
      c.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const y = i * h + 4 + r() * (h - 8);
        c.beginPath();
        c.moveTo(x + 2, y);
        c.lineTo(x + len - 2, y + (r() - 0.5) * 3);
        c.stroke();
      }
      x += len;
    }
  }
}

export function tiles(c: CanvasRenderingContext2D) {
  const r = rng(33);
  c.fillStyle = '#a7a299';
  c.fillRect(0, 0, 512, 512);
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const t = 0.94 + r() * 0.1;
      c.fillStyle = `rgb(${172 * t},${167 * t},${158 * t})`;
      c.fillRect(tx * 256 + 2, ty * 256 + 2, 252, 252);
      c.strokeStyle = 'rgba(120,114,104,0.25)';
      c.lineWidth = 1.2;
      for (let k = 0; k < 6; k++) {
        c.beginPath();
        c.moveTo(tx * 256 + r() * 256, ty * 256);
        c.bezierCurveTo(tx * 256 + r() * 256, ty * 256 + 90, tx * 256 + r() * 256, ty * 256 + 170, tx * 256 + r() * 256, ty * 256 + 256);
        c.stroke();
      }
    }
  c.strokeStyle = 'rgba(80,76,70,0.5)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(256, 0);
  c.lineTo(256, 512);
  c.moveTo(0, 256);
  c.lineTo(512, 256);
  c.stroke();
}

export function stoneWall(c: CanvasRenderingContext2D) {
  const r = rng(44);
  c.fillStyle = '#9b9588';
  c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const v = 130 + r() * 50;
    c.fillStyle = `rgba(${v},${v - 4},${v - 14},0.5)`;
    c.fillRect(r() * 512, r() * 512, 2, 2);
  }
  c.strokeStyle = 'rgba(60,56,50,0.55)';
  c.lineWidth = 3;
  for (const y of [0, 170, 340]) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(512, y);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(256, 0);
  c.lineTo(256, 170);
  c.moveTo(128, 170);
  c.lineTo(128, 340);
  c.moveTo(384, 340);
  c.lineTo(384, 512);
  c.stroke();
}

export function granite(c: CanvasRenderingContext2D) {
  const r = rng(52);
  c.fillStyle = '#383a3f';
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = 40 + r() * 40;
    c.fillStyle = `rgb(${v},${v},${v + 4})`;
    c.fillRect(r() * 256, r() * 256, 2, 2);
  }
}

export function ceilingTiles(c: CanvasRenderingContext2D) {
  c.fillStyle = '#cbc2b2';
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = 'rgba(70,60,48,0.55)';
  c.lineWidth = 3;
  c.strokeRect(1.5, 1.5, 253, 253);
  c.strokeStyle = 'rgba(70,60,48,0.12)';
  c.lineWidth = 1;
  for (let i = 32; i < 256; i += 32) {
    c.beginPath();
    c.moveTo(i, 0);
    c.lineTo(i, 256);
    c.moveTo(0, i);
    c.lineTo(256, i);
    c.stroke();
  }
}

export function buildHall(scene: B.Scene, shadow: B.ShadowGenerator | null, quality: 'low' | 'medium' | 'high') {
  const std = (name: string, color: string, o: { rough?: number; emissive?: string; tex?: B.Texture; ei?: number } = {}) => {
    const m = new B.StandardMaterial(name, scene);
    m.diffuseColor = o.tex ? B.Color3.White() : B.Color3.FromHexString(color);
    const spec = 0.5 * (1 - (o.rough ?? 0.8));
    m.specularColor = new B.Color3(spec, spec, spec);
    m.specularPower = o.rough !== undefined && o.rough < 0.3 ? 64 : 24;
    if (o.tex) m.diffuseTexture = o.tex;
    if (o.emissive) {
      m.emissiveColor = B.Color3.FromHexString(o.emissive).scale(o.ei ?? 1);
      m.disableLighting = true;
    }
    return m;
  };
  const wood = (name: string, u: number, v: number) => std(name, '#fff', { tex: canvasTex(scene, name, 512, 512, lightWood, u, v), rough: 0.45 });
  const mats = {
    floor: std('floor', '#fff', { tex: canvasTex(scene, 'tileTex', 512, 512, tiles, 9, 9), rough: 0.12 }),
    stone: std('stone', '#fff', { tex: canvasTex(scene, 'stoneTex', 512, 512, stoneWall, 7, 2), rough: 0.9 }),
    granite: std('granite', '#fff', { tex: canvasTex(scene, 'graniteTex', 256, 256, granite, 6, 1), rough: 0.35 }),
    stage: std('stageM', '#fff', { tex: canvasTex(scene, 'stageTop', 512, 512, floorBoards, 4, 3), rough: 0.18 }),
    ceiling: std('ceilingM', '#fff', { tex: canvasTex(scene, 'ceilTex', 256, 256, ceilingTiles, 10, 12), rough: 1 }),
    trim: std('trim', '#1a1c22', { rough: 0.45 }),
    metal: std('metal', '#aab0bd', { rough: 0.2 }),
    dark: std('dark', '#0d0f14', { rough: 0.6 }),
    board: std('whiteboard', '#e9ecf0', { rough: 0.3 }),
    led: std('led', '#ffffff', { emissive: '#ffd9a0', ei: 1.1 }),
    ledWhite: std('ledW', '#ffffff', { emissive: '#fff4e4', ei: 1.1 }),
  };

  const meshes: B.Mesh[] = [];
  const box = (name: string, size: V3, pos: V3, mat: B.Material, o: { rotY?: number; cast?: boolean; parent?: B.TransformNode } = {}) => {
    const b = B.MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
    b.position.set(...pos);
    if (o.rotY) b.rotation.y = o.rotY;
    b.material = mat;
    b.receiveShadows = true;
    b.isPickable = false;
    if (o.parent) b.parent = o.parent;
    if (o.cast && shadow) shadow.addShadowCaster(b);
    meshes.push(b);
    return b;
  };
  const rod = (a: V3, b2: V3, d: number, mat: B.Material) => {
    const va = new B.Vector3(...a);
    const vb = new B.Vector3(...b2);
    const c = B.MeshBuilder.CreateCylinder('rod', { diameter: d, height: B.Vector3.Distance(va, vb), tessellation: 8 }, scene);
    c.position = B.Vector3.Center(va, vb);
    c.rotationQuaternion = B.Quaternion.FromUnitVectorsToRef(B.Vector3.Up(), vb.subtract(va).normalize(), new B.Quaternion());
    c.material = mat;
    c.isPickable = false;
    meshes.push(c);
  };

  // ---------------------------------------------------------------- polished tile floor
  const floor = B.MeshBuilder.CreateGround('floor', { width: ROOM.x * 2, height: ROOM.zFront - ROOM.zBack }, scene);
  floor.position.set(0, 0, (ROOM.zFront + ROOM.zBack) / 2);
  floor.material = mats.floor;
  floor.receiveShadows = true;
  floor.isPickable = false;

  // ---------------------------------------------------------------- stage: a wooden top with a chamfered dark front
  const fz = STAGE_FRONT;
  const stageDepth = fz - ROOM.zBack;
  box('stageTop', [STAGE_HALF * 2, 0.06, stageDepth], [0, STAGE_Y - 0.03, ROOM.zBack + stageDepth / 2], mats.stage);
  box('stageCore', [STAGE_HALF * 2 - 0.2, STAGE_Y - 0.06, stageDepth - 0.4], [0, (STAGE_Y - 0.06) / 2, ROOM.zBack + (stageDepth - 0.4) / 2], mats.granite);
  const skirt = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    box('skirt', [len, STAGE_Y - 0.04, 0.12], [mx, (STAGE_Y - 0.04) / 2, mz], mats.granite, { rotY: rot, cast: false });
    box('skirtLed', [len, 0.035, 0.05], [mx, 0.05, mz + 0.08], mats.led, { rotY: rot });
    box('skirtCap', [len + 0.02, 0.03, 0.2], [mx, STAGE_Y - 0.015, mz], mats.metal, { rotY: rot });
  };
  skirt(-5.4, fz, 5.4, fz);
  skirt(-STAGE_HALF + 0.4, fz - 1.1, -5.4, fz);
  skirt(5.4, fz, STAGE_HALF - 0.4, fz - 1.1);
  // dark filler behind the chamfers so no gap shows from the sides
  for (const s of [-1, 1]) box('endSkirt', [0.12, STAGE_Y - 0.04, 1.6], [s * (STAGE_HALF - 0.4), (STAGE_Y - 0.04) / 2, fz - 1.9], mats.granite);

  // stairs at both ends with a rail
  for (const s of [-1, 1] as const) {
    const x = s * (STAGE_HALF + 0.9);
    for (let i = 0; i < 4; i++) {
      const h = (STAGE_Y / 4) * (i + 1);
      const d = 0.34 * (4 - i);
      box('step', [1.8, h, d], [x, h / 2, fz - 1.4 + d / 2], mats.granite);
      box('stepTop', [1.8, 0.02, d], [x, h + 0.011, fz - 1.4 + d / 2], mats.metal);
      box('stepLed', [1.8, 0.02, 0.03], [x, h - 0.02, fz - 1.4 + d + 0.01], mats.led);
    }
    box('landing', [1.8, STAGE_Y, 1.6], [x, STAGE_Y / 2, fz - 2.2], mats.granite);
    const xr = x + s * 0.88;
    rod([xr, STAGE_Y, fz - 2.9], [xr, STAGE_Y + 0.95, fz - 2.9], 0.045, mats.metal);
    rod([xr, 0, fz - 0.05], [xr, 0.95, fz - 0.05], 0.045, mats.metal);
    rod([xr, 0.95, fz - 0.05], [xr, STAGE_Y + 0.95, fz - 1.4], 0.04, mats.metal);
    rod([xr, STAGE_Y + 0.95, fz - 1.4], [xr, STAGE_Y + 0.95, fz - 2.9], 0.04, mats.metal);
  }

  // ---------------------------------------------------------------- walls
  const wallZ = WALL_Z;
  const back = B.MeshBuilder.CreatePlane('backwall', { width: ROOM.x * 2, height: ROOM.h }, scene);
  back.position.set(0, ROOM.h / 2, ROOM.zBack + 0.01);
  back.rotation.y = Math.PI;
  back.material = mats.stone;
  back.isPickable = false;
  meshes.push(back);
  // dark panel wall behind the screen, with a wood header
  box('centreWall', [WING.x0 * 2, ROOM.h, 0.14], [0, ROOM.h / 2, wallZ - 0.07], mats.granite);
  box('centreWood', [WING.x0 * 2 + 0.6, 0.9, 0.12], [0, ROOM.h - 0.5, wallZ], wood('woodCentre', 6, 1));
  // the wings turn toward the audience
  const wingLen = (BOARD.x + 2 - WING.x0) / Math.cos(WING.angle) + 0.3;
  for (const s of [-1, 1] as const) {
    const g = new B.TransformNode('wing', scene);
    g.position.set(s * (WING.x0 + (wingLen / 2) * Math.cos(WING.angle)), ROOM.h / 2, wallZ + (wingLen / 2) * Math.sin(WING.angle));
    g.rotation.y = -s * WING.angle;
    box('wingPanel', [wingLen, ROOM.h, 0.14], [0, 0, -0.07], wood(`woodW${s}`, wingLen / 1.6, 1.4), { parent: g });
    box('wingCove', [wingLen, 0.05, 0.06], [0, ROOM.h / 2 - 1.15, 0.05], mats.led, { parent: g });
    box('wingEdgeLed', [0.05, ROOM.h - 1.4, 0.05], [s * (wingLen / 2 - 0.02), -0.4, 0.05], mats.led, { parent: g });
    box('wingSkirt', [wingLen, 0.9, 0.16], [0, -ROOM.h / 2 + 0.45 + STAGE_Y, -0.02], mats.granite, { parent: g });
    for (let i = 0; i < 3; i++) box('speaker', [0.55, 0.38, 0.4], [s * (wingLen / 2 - 0.5), 1.75 - i * 0.4, 0.2], mats.dark, { parent: g });
    // closing return from the wing end to the back wall
    const endZ = wallZ + wingLen * Math.sin(WING.angle);
    const endX = s * (WING.x0 + wingLen * Math.cos(WING.angle));
    box('wingEnd', [0.14, ROOM.h, endZ - ROOM.zBack], [endX, ROOM.h / 2, (endZ + ROOM.zBack) / 2], mats.stone);
  }
  // stone side walls with a wooden door near the stage and uplights
  for (const s of [-1, 1] as const) {
    const wall = B.MeshBuilder.CreateBox('sidewall', { width: 0.2, height: ROOM.h, depth: ROOM.zFront - ROOM.zBack }, scene);
    wall.position.set(s * (ROOM.x + 0.1), ROOM.h / 2, (ROOM.zFront + ROOM.zBack) / 2);
    wall.material = std(`stoneS${s}`, '#fff', { tex: canvasTex(scene, `stoneS${s}`, 512, 512, stoneWall, 5, 2), rough: 0.9 });
    wall.receiveShadows = true;
    wall.isPickable = false;
    meshes.push(wall);
    box('door', [0.1, 2.3, 1.2], [s * (ROOM.x - 0.05), 1.15, ROOM.zBack + 2.2], wood(`woodD${s}`, 1, 1));
    for (let i = 0; i < 5; i++) box('sconce', [0.1, 0.9, 0.12], [s * (ROOM.x - 0.06), 3.4, ROOM.zBack + 4.5 + i * 2.2], mats.ledWhite);
    box('baseboard', [0.08, 0.16, ROOM.zFront - ROOM.zBack], [s * (ROOM.x - 0.04), 0.08, (ROOM.zFront + ROOM.zBack) / 2], mats.trim);
  }
  box('rearWall', [ROOM.x * 2, ROOM.h, 0.2], [0, ROOM.h / 2, ROOM.zFront + 0.1], mats.stone);

  // ---------------------------------------------------------------- screen and boards
  box('screenFrame', [SCREEN.w + 0.16, SCREEN.h + 0.16, 0.14], [SCREEN.x, SCREEN.y, wallZ + 0.06], mats.dark, { cast: true });
  box('screenLed', [SCREEN.w + 0.6, 0.03, 0.05], [0, STAGE_Y + 0.9, wallZ + 0.1], mats.led);
  for (const s of [-1, 1] as const) {
    const { pos, rotY } = boardPose(s);
    const g = new B.TransformNode('boardframe', scene);
    g.position.set(...pos);
    g.rotation.y = rotY;
    box('boardBack', [BOARD.w, BOARD.h, 0.1], [0, 0, 0.02], mats.board, { parent: g });
    box('boardFrameTop', [BOARD.w + 0.06, 0.04, 0.12], [0, BOARD.h / 2 + 0.02, 0.03], mats.metal, { parent: g });
    box('boardFrameBottom', [BOARD.w + 0.06, 0.04, 0.12], [0, -BOARD.h / 2 - 0.02, 0.03], mats.metal, { parent: g });
    box('boardTray', [BOARD.w * 0.9, 0.04, 0.14], [0, -BOARD.h / 2 - 0.06, 0.09], mats.dark, { parent: g });
  }

  // ---------------------------------------------------------------- lectern: wood front, dark side, monitor and microphone
  const lec = new B.TransformNode('lectern', scene);
  lec.position.set(-4.7, STAGE_Y, -3.2);
  lec.rotation.y = 0.2;
  box('lecternBody', [0.85, 1.05, 0.6], [0.3, 0.525, 0], wood('woodLec', 1, 1), { parent: lec, cast: true });
  box('lecternDark', [0.55, 1.15, 0.6], [-0.4, 0.575, -0.05], mats.dark, { parent: lec, cast: true });
  box('lecternTop', [0.9, 0.04, 0.64], [0.3, 1.07, 0], mats.trim, { parent: lec });
  box('lecternMonitor', [0.5, 0.32, 0.03], [-0.4, 1.34, -0.12], mats.dark, { parent: lec });

  // ---------------------------------------------------------------- ceiling: tiles, light lines, downlights, projector
  const ceil = B.MeshBuilder.CreatePlane('ceiling', { width: ROOM.x * 2, height: ROOM.zFront - ROOM.zBack }, scene);
  ceil.position.set(0, ROOM.h, (ROOM.zFront + ROOM.zBack) / 2);
  ceil.rotation.x = -Math.PI / 2;
  ceil.material = mats.ceiling;
  ceil.isPickable = false;
  meshes.push(ceil);
  for (const z of [-3.6, -0.2, 3.2, 6.6, 10]) {
    box('lightLine', [5.6, 0.04, 0.1], [-5.2, ROOM.h - 0.03, z], mats.ledWhite);
    box('lightLine', [5.6, 0.04, 0.1], [5.2, ROOM.h - 0.03, z], mats.ledWhite);
    box('ceilingRail', [ROOM.x * 2 - 1, 0.03, 0.05], [0, ROOM.h - 0.02, z + 0.5], mats.dark);
  }
  box('coveBack', [ROOM.x * 2 - 1, 0.05, 0.12], [0, ROOM.h - 0.04, ROOM.zBack + 0.6], mats.ledWhite);
  const downlight = B.MeshBuilder.CreateDisc('downlight', { radius: 0.09, tessellation: 12 }, scene);
  downlight.material = mats.ledWhite;
  downlight.rotation.x = Math.PI / 2;
  downlight.position.y = ROOM.h - 0.01;
  downlight.isVisible = false;
  for (const z of [-3.3, 0.2, 3.6, 7, 10.4])
    for (let i = -4; i <= 4; i++) {
      const d = downlight.createInstance('dl');
      d.position.set(i * 2.2, ROOM.h - 0.01, z);
      d.isPickable = false;
    }
  rod([0, ROOM.h, 5.2], [0, ROOM.h - 0.5, 5.2], 0.05, mats.metal);
  box('projector', [0.8, 0.28, 0.7], [0, ROOM.h - 0.64, 5.2], std('projectorM', '#d9dadf', { rough: 0.5 }));
  box('projectorLens', [0.22, 0.16, 0.1], [0, ROOM.h - 0.64, 4.8], mats.dark);
  // a pool of warm light on the stage from above (one light, no extra shadow map)
  if (quality !== 'low') {
    const spot = new B.SpotLight('stagePool', new B.Vector3(0, 6.2, 1), new B.Vector3(0, -1, -0.6).normalize(), 1.7, 1.5, scene);
    spot.diffuse = B.Color3.FromHexString('#ffe4bd');
    spot.intensity = 0.6;
    spot.range = 14;
  }

  for (const m of meshes) if (!m.parent) m.freezeWorldMatrix();
}
