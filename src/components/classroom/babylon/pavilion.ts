import * as B from '@babylonjs/core';
import { BOARD, SCREEN, STAGE_Y, WALL_Z, WING, boardPose } from '../scene/layout';
import { canvasTex, ceilingTiles, floorBoards, granite, lightWood, rng, tiles } from './hall';

/**
 * The open-air pavilion: the same stage, screen and boards under a timber roof, with stone columns, planters and glass
 * railings, and a wide mountain backdrop behind and around it. The backdrop is a painted scene drawn in code. To use a real
 * picture or video instead, put `nature.mp4` or `nature.jpg` in public/backdrops/ and it is picked up automatically.
 */

const X = 10;
const H = 6.3;
const Z_BACK = -5;
const Z_FRONT = 14;
const STAGE_FRONT = 1.8;
const STAGE_HALF = 7.4;

type V3 = [number, number, number];

function stoneBricks(c: CanvasRenderingContext2D) {
  const r = rng(61);
  c.fillStyle = '#4b463f';
  c.fillRect(0, 0, 512, 512);
  const rows = 8;
  const h = 512 / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * 120;
    while (x < 512) {
      const len = 90 + r() * 110;
      const t = 0.75 + r() * 0.5;
      c.fillStyle = `rgb(${142 * t},${128 * t},${108 * t})`;
      c.fillRect(x + 2, i * h + 2, len - 4, h - 4);
      x += len;
    }
  }
}


import { installBackdrop, type BackdropItem } from './backdrop';


/** `variant` 'ridge' has stone columns and wood wings; 'forest' is an open deck with slatted towers. `scenery` is 'queue' or a library item id. */
export function buildPavilion(scene: B.Scene, shadow: B.ShadowGenerator | null, quality: 'low' | 'medium' | 'high', variant: 'ridge' | 'forest' = 'ridge', scenery = 'queue') {
  const forest = variant === 'forest';
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
    floor: std('pFloor', '#fff', { tex: canvasTex(scene, 'pTile', 512, 512, tiles, 9, 9), rough: 0.12 }),
    stage: std('pStage', '#fff', { tex: canvasTex(scene, 'pStageTop', 512, 512, floorBoards, 4, 3), rough: 0.18 }),
    stone: std('pStone', '#fff', { tex: canvasTex(scene, 'pBricks', 512, 512, stoneBricks, 1, 3), rough: 0.9 }),
    stoneWide: std('pStoneW', '#fff', { tex: canvasTex(scene, 'pBricksW', 512, 512, stoneBricks, 6, 0.5), rough: 0.9 }),
    granite: std('pGranite', '#fff', { tex: canvasTex(scene, 'pGranite', 256, 256, granite, 6, 1), rough: 0.35 }),
    ceiling: std('pCeil', '#fff', { tex: canvasTex(scene, 'pCeilTex', 256, 256, ceilingTiles, 8, 4), rough: 1 }),
    trim: std('pTrim', '#1a1c22', { rough: 0.45 }),
    metal: std('pMetal', '#aab0bd', { rough: 0.2 }),
    dark: std('pDark', '#0d0f14', { rough: 0.6 }),
    board: std('pBoard', '#e9ecf0', { rough: 0.3 }),
    glass: std('pGlass', '#bfe3f0', { rough: 0.1 }),
    leaf: std('pLeaf', '#2f7d3a', { rough: 0.8 }),
    pot: std('pPot', '#2a2d33', { rough: 0.6 }),
    led: std('pLed', '#ffffff', { emissive: '#ffd9a0', ei: 1.1 }),
    ledWhite: std('pLedW', '#ffffff', { emissive: '#fff4e4', ei: 1.1 }),
  };
  mats.glass.alpha = 0.25;

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

  installBackdrop(scene, meshes, scenery, forest ? 'pines' : 'alpine');


  // ---------------------------------------------------------------- terrace floor and a glass railing around the open sides
  const floor = B.MeshBuilder.CreateGround('floor', { width: X * 2, height: Z_FRONT - Z_BACK }, scene);
  floor.position.set(0, 0, (Z_FRONT + Z_BACK) / 2);
  floor.material = mats.floor;
  floor.receiveShadows = true;
  floor.isPickable = false;
  for (const s of [-1, 1]) {
    box('railTop', [0.06, 0.05, Z_FRONT - Z_BACK], [s * (X - 0.05), 1.05, (Z_FRONT + Z_BACK) / 2], mats.metal);
    box('glass', [0.03, 0.95, Z_FRONT - Z_BACK], [s * (X - 0.05), 0.55, (Z_FRONT + Z_BACK) / 2], mats.glass);
    for (let z = Z_BACK + 1; z < Z_FRONT; z += 3) box('railPost', [0.07, 1.05, 0.07], [s * (X - 0.05), 0.52, z], mats.trim);
  }
  box('railBack', [X * 2, 0.05, 0.06], [0, 1.05, Z_BACK + 0.2], mats.metal);

  // ---------------------------------------------------------------- stage with a stone-clad front
  const fz = STAGE_FRONT;
  const stageDepth = fz - Z_BACK;
  box('stageTop', [STAGE_HALF * 2, 0.06, stageDepth], [0, STAGE_Y - 0.03, Z_BACK + stageDepth / 2], mats.stage);
  box('stageCore', [STAGE_HALF * 2 - 0.2, STAGE_Y - 0.06, stageDepth - 0.4], [0, (STAGE_Y - 0.06) / 2, Z_BACK + (stageDepth - 0.4) / 2], mats.granite);
  const skirt = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const m = forest ? mats.granite : std(`skirtStone${Math.round(x0)}`, '#fff', { tex: canvasTex(scene, `skirtTex${Math.round(x0)}`, 512, 512, stoneBricks, len / 2.4, 1), rough: 0.9 });
    box('skirt', [len, STAGE_Y - 0.04, 0.14], [mx, (STAGE_Y - 0.04) / 2, mz], m, { rotY: rot });
    box('skirtLed', [len, 0.035, 0.05], [mx, 0.05, mz + 0.09], mats.led, { rotY: rot });
    box('skirtCap', [len + 0.02, 0.04, 0.22], [mx, STAGE_Y - 0.02, mz], mats.stage, { rotY: rot });
  };
  skirt(-5.4, fz, 5.4, fz);
  skirt(-STAGE_HALF + 0.4, fz - 1.1, -5.4, fz);
  skirt(5.4, fz, STAGE_HALF - 0.4, fz - 1.1);
  for (const s of [-1, 1]) box('endSkirt', [0.12, STAGE_Y - 0.04, 1.6], [s * (STAGE_HALF - 0.4), (STAGE_Y - 0.04) / 2, fz - 1.9], mats.stone);
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

  // ---------------------------------------------------------------- the back: dark panel under the screen, wood wings, stone columns
  const wallZ = WALL_Z;
  const WALL_H = 4.3; // shorter than the room, so the mountains show above it
  if (!forest) {
    box('centreWall', [WING.x0 * 2, 1.4, 0.14], [0, 0.7, wallZ - 0.07], mats.granite);
    box('centreWallUp', [WING.x0 * 2, WALL_H - 1.4, 0.14], [0, 1.4 + (WALL_H - 1.4) / 2, wallZ - 0.07], mats.trim);
  } else {
    // open deck: a dark base wall with a glass rail and planters behind the stage, slatted towers at the sides, a slatted band under each board
    box('deckBase', [WING.x0 * 2 + 0.4, 0.5, 0.3], [0, STAGE_Y + 0.25, wallZ + 0.1], mats.granite);
    box('deckGlass', [WING.x0 * 2 + 0.4, 0.75, 0.03], [0, STAGE_Y + 0.9, wallZ + 0.2], mats.glass);
    box('deckRail', [WING.x0 * 2 + 0.4, 0.05, 0.08], [0, STAGE_Y + 1.3, wallZ + 0.2], mats.metal);
    box('deckPlanter', [WING.x0 * 2 + 0.4, 0.35, 0.5], [0, STAGE_Y + 0.17, wallZ + 0.55], mats.pot);
    for (let i = 0; i < 16; i++) {
      const leaf = B.MeshBuilder.CreateCylinder('leaf', { diameterTop: 0.02, diameterBottom: 0.3, height: 0.6 + (i % 4) * 0.12, tessellation: 5 }, scene);
      leaf.position.set(-WING.x0 + 0.2 + i * 0.4, STAGE_Y + 0.34 + 0.35, wallZ + 0.55);
      leaf.rotation.z = ((i % 5) - 2) * 0.15;
      leaf.material = mats.leaf;
      leaf.isPickable = false;
      meshes.push(leaf);
    }
    for (const s of [-1, 1] as const) {
      const tx = s * (BOARD.x + 2.4);
      box('tower', [1.15, H, 1.1], [tx, H / 2, wallZ + 2.3], wood(`pTower${s}`, 3, 4), { cast: true });
      box('towerLed', [0.05, H - 0.6, 0.05], [tx - s * 0.6, H / 2, wallZ + 2.86], mats.led);
      box('towerCap', [1.15, 1.5, 1.1], [tx, H - 0.75, wallZ + 2.3], mats.stone);
      for (let i = 0; i < 2; i++) box('speaker', [0.42, 0.38, 0.34], [tx - s * 0.1, 4.4 - i * 0.42, wallZ + 2.95], mats.dark);
      const band = new B.TransformNode('band', scene);
      band.position.set(s * BOARD.x, STAGE_Y + 0.75, boardPose(s).pos[2] - 0.05);
      band.rotation.y = -s * WING.angle;
      box('slatBand', [BOARD.w + 0.4, 1.5, 0.12], [0, 0, 0], wood(`pBand${s}`, 3, 1), { parent: band });
      box('slatBandLed', [BOARD.w + 0.4, 0.04, 0.05], [0, 0.72, 0.07], mats.led, { parent: band });
    }
  }
  const wingLen = (BOARD.x + 2 - WING.x0) / Math.cos(WING.angle) + 0.3;
  for (const s of forest ? ([] as const) : ([-1, 1] as const)) {
    const g = new B.TransformNode('wing', scene);
    g.position.set(s * (WING.x0 + (wingLen / 2) * Math.cos(WING.angle)), WALL_H / 2, wallZ + (wingLen / 2) * Math.sin(WING.angle));
    g.rotation.y = -s * WING.angle;
    box('wingPanel', [wingLen, WALL_H, 0.14], [0, 0, -0.07], wood(`pWoodW${s}`, wingLen / 1.4, 1.2), { parent: g });
    box('wingTopLed', [wingLen, 0.04, 0.05], [0, WALL_H / 2 - 0.05, 0.04], mats.led, { parent: g });
    // stone column at the outer end of each wing, rising to the roof
    const ex = s * (WING.x0 + (wingLen - 0.2) * Math.cos(WING.angle));
    const ez = wallZ + (wingLen - 0.2) * Math.sin(WING.angle);
    box('column', [1.1, H, 1.1], [ex + s * 0.4, H / 2, ez - 0.2], mats.stone, { cast: true });
    for (let i = 0; i < 2; i++) box('speaker', [0.42, 0.38, 0.34], [ex - s * 0.3, 4.4 - i * 0.42, ez + 0.5], mats.dark);
    // a planter beside each column
    box('planter', [1.1, 0.5, 0.7], [ex + s * 1.05, 0.25 + STAGE_Y, ez + 0.6], mats.pot);
    for (let i = 0; i < 6; i++) {
      const leaf = B.MeshBuilder.CreateCylinder('leaf', { diameterTop: 0.02, diameterBottom: 0.35, height: 0.9 + (i % 3) * 0.15, tessellation: 5 }, scene);
      leaf.position.set(ex + s * 1.05 + (i - 2.5) * 0.14, STAGE_Y + 0.5 + 0.45, ez + 0.6);
      leaf.rotation.z = (i - 2.5) * 0.18;
      leaf.material = mats.leaf;
      leaf.isPickable = false;
      meshes.push(leaf);
    }
    // wood post with a stone pier beside the screen
    box('pier', [0.55, WALL_H, 0.5], [s * (WING.x0 - 0.3), WALL_H / 2, wallZ + 0.1], mats.stone);
  }

  // ---------------------------------------------------------------- screen, boards, lectern
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
  const lec = new B.TransformNode('lectern', scene);
  lec.position.set(-4.7, STAGE_Y, -3.2);
  lec.rotation.y = 0.2;
  box('lecternBody', [0.85, 1.05, 0.6], [0.3, 0.525, 0], wood('pWoodLec', 1, 1), { parent: lec, cast: true });
  box('lecternDark', [0.55, 1.15, 0.6], [-0.4, 0.575, -0.05], mats.dark, { parent: lec, cast: true });
  box('lecternTop', [0.9, 0.04, 0.64], [0.3, 1.07, 0], mats.trim, { parent: lec });
  box('lecternMonitor', [0.5, 0.32, 0.03], [-0.4, 1.34, -0.12], mats.dark, { parent: lec });

  // ---------------------------------------------------------------- the timber roof over the stage and the front rows
  const roofZ0 = Z_BACK - 1.5;
  const roofZ1 = 8;
  const roofD = roofZ1 - roofZ0;
  const roof = B.MeshBuilder.CreateBox('roof', { width: X * 2 + 1.6, height: 0.25, depth: roofD }, scene);
  roof.position.set(0, H + 0.12, (roofZ0 + roofZ1) / 2);
  roof.material = mats.ceiling;
  roof.isPickable = false;
  meshes.push(roof);
  const roofTop = B.MeshBuilder.CreateBox('roofEdge', { width: X * 2 + 1.7, height: 0.4, depth: 0.3 }, scene);
  roofTop.position.set(0, H + 0.1, roofZ1);
  roofTop.material = wood('pWoodRoof', 8, 1);
  roofTop.isPickable = false;
  meshes.push(roofTop);
  for (let i = 0; i < 6; i++) {
    const z = Z_BACK + i * 2.5;
    box('beam', [X * 2 + 1.6, 0.42, 0.34], [0, H - 0.21, z], wood(`pWoodB${i}`, 8, 0.5));
  }
  // front posts of the roof, in the same stone as the columns
  for (const s of [-1, 1]) for (const z of [roofZ1 - 0.4]) box('frontPost', [0.6, H, 0.6], [s * (X - 0.2), H / 2, z], mats.stone);
  box('coveBack', [X * 2 - 3, 0.05, 0.12], [0, H - 0.45, Z_BACK + 0.8], mats.ledWhite);
  // the projector hangs from the beams
  rod([0, H, 5.2], [0, H - 0.5, 5.2], 0.05, mats.metal);
  box('projector', [0.8, 0.28, 0.7], [0, H - 0.64, 5.2], std('pProjector', '#d9dadf', { rough: 0.5 }));
  box('projectorLens', [0.22, 0.16, 0.1], [0, H - 0.64, 4.8], mats.dark);
  if (quality !== 'low') {
    const spot = new B.SpotLight('stagePool', new B.Vector3(0, 6, 1), new B.Vector3(0, -1, -0.6).normalize(), 1.7, 1.5, scene);
    spot.diffuse = B.Color3.FromHexString('#ffe9c7');
    spot.intensity = 0.5;
    spot.range = 14;
  }

  for (const m of meshes) if (!m.parent) m.freezeWorldMatrix();
}
