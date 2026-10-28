import * as B from '@babylonjs/core';
import { BOARD, SCREEN, STAGE_Y, WALL_Z, WING, boardPose } from '../scene/layout';
import { installBackdrop } from './backdrop';
import { canvasTex, ceilingTiles, floorBoards, granite, lightWood, rng, stoneWall, tiles } from './hall';

/**
 * The collaboration hall: a glass-walled room with the countryside outside, a round stage, a big screen for the slides with a
 * strip of dashboards under it, a board on each side for the lesson text, round tables with chairs, and a wood ceiling with a
 * ring of light. The scenery outside the windows is the replaceable backdrop (picture, video, or the painted scenes).
 */

const X = 10;
const H = 6.5;
const Z_BACK = -5;
const Z_FRONT = 14;
const STAGE = { cz: -1.5, rz: 3.3, rx: 7.4 };

type V3 = [number, number, number];

function dashboards(c: CanvasRenderingContext2D) {
  const r = rng(91);
  c.fillStyle = '#0a1424';
  c.fillRect(0, 0, 1280, 160);
  for (let i = 0; i < 5; i++) {
    const x = i * 256;
    c.fillStyle = '#0e2038';
    c.fillRect(x + 6, 6, 244, 148);
    c.strokeStyle = '#2f7bff';
    c.lineWidth = 2;
    c.strokeRect(x + 6, 6, 244, 148);
    if (i === 1) {
      c.fillStyle = '#2f6fbf';
      for (let k = 0; k < 140; k++) c.fillRect(x + 20 + r() * 210, 24 + r() * 100, 4, 3);
    } else if (i === 3) {
      for (let k = 0; k < 3; k++) {
        c.strokeStyle = ['#34d3ff', '#59f286', '#ffb84d'][k];
        c.lineWidth = 6;
        c.beginPath();
        c.arc(x + 50 + k * 70, 80, 26, 0, Math.PI * (1.2 + r() * 0.7));
        c.stroke();
      }
    } else {
      c.fillStyle = '#34d3ff';
      for (let k = 0; k < 10; k++) c.fillRect(x + 20 + k * 22, 120 - (10 + r() * 80), 14, 10 + r() * 80);
    }
  }
}

export function buildCollab(scene: B.Scene, shadow: B.ShadowGenerator | null, quality: 'low' | 'medium' | 'high', scenery = 'queue') {
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
    floor: std('cFloor', '#fff', { tex: canvasTex(scene, 'cTile', 512, 512, tiles, 9, 9), rough: 0.1 }),
    stage: std('cStage', '#fff', { tex: canvasTex(scene, 'cStageTop', 512, 512, floorBoards, 3, 2), rough: 0.15 }),
    stone: std('cStone', '#fff', { tex: canvasTex(scene, 'cStoneTex', 512, 512, stoneWall, 2, 1), rough: 0.9 }),
    granite: std('cGranite', '#fff', { tex: canvasTex(scene, 'cGranite', 256, 256, granite, 6, 1), rough: 0.35 }),
    ceiling: std('cCeil', '#fff', { tex: canvasTex(scene, 'cCeilTex', 256, 256, ceilingTiles, 8, 10), rough: 1 }),
    deck: std('cDeck', '#fff', { tex: canvasTex(scene, 'cDeckTex', 512, 512, floorBoards, 2, 8), rough: 0.5 }),
    trim: std('cTrim', '#15171c', { rough: 0.45 }),
    metal: std('cMetal', '#aab0bd', { rough: 0.2 }),
    dark: std('cDark', '#0d0f14', { rough: 0.6 }),
    glass: std('cGlass', '#cfe8f5', { rough: 0.05 }),
    leaf: std('cLeaf', '#2f7d3a', { rough: 0.8 }),
    pot: std('cPot', '#2a2d33', { rough: 0.6 }),
    chair: std('cChair', '#2b2e35', { rough: 0.6 }),
    mesh: std('cMesh', '#4d5058', { rough: 0.9 }),
    tableTop: std('cTable', '#e7c79d', { rough: 0.35 }),
    led: std('cLed', '#ffffff', { emissive: '#ffd9a0', ei: 1.1 }),
    ledWhite: std('cLedW', '#ffffff', { emissive: '#fff4e4', ei: 1.1 }),
  };
  mats.glass.alpha = 0.1;
  mats.glass.backFaceCulling = false;

  const meshes: B.Mesh[] = [];
  const track = (m: B.Mesh) => {
    m.isPickable = false;
    meshes.push(m);
    return m;
  };
  const box = (name: string, size: V3, pos: V3, mat: B.Material, o: { rotY?: number; cast?: boolean; parent?: B.TransformNode } = {}) => {
    const b = B.MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
    b.position.set(...pos);
    if (o.rotY) b.rotation.y = o.rotY;
    b.material = mat;
    b.receiveShadows = true;
    if (o.parent) b.parent = o.parent;
    if (o.cast && shadow) shadow.addShadowCaster(b);
    return track(b);
  };

  // the scenery outside: the sides show through the glass, the back shows beyond the terrace
  installBackdrop(scene, meshes, scenery, 'alpine', {
    back: [0, -40, Math.PI, 110],
    left: [-34, 3, -Math.PI / 2, 96],
    right: [34, 3, Math.PI / 2, 96],
    y: 12.2,
    w: 110,
    h: 34.4,
  });

  // ---------------------------------------------------------------- floor and the terrace outside the glass
  const floor = B.MeshBuilder.CreateGround('floor', { width: X * 2, height: Z_FRONT - Z_BACK }, scene);
  floor.position.set(0, 0, (Z_FRONT + Z_BACK) / 2);
  floor.material = mats.floor;
  floor.receiveShadows = true;
  track(floor);
  for (const s of [-1, 1]) {
    const deck = B.MeshBuilder.CreateGround('deck', { width: 8, height: Z_FRONT - Z_BACK }, scene);
    deck.position.set(s * (X + 4), -0.02, (Z_FRONT + Z_BACK) / 2);
    deck.material = mats.deck;
    track(deck);
    box('terraceRail', [0.06, 0.05, Z_FRONT - Z_BACK], [s * (X + 7.8), 1.05, (Z_FRONT + Z_BACK) / 2], mats.metal);
    box('terraceGlass', [0.03, 0.95, Z_FRONT - Z_BACK], [s * (X + 7.8), 0.55, (Z_FRONT + Z_BACK) / 2], mats.glass);
  }

  // ---------------------------------------------------------------- the round stage
  const stage = B.MeshBuilder.CreateCylinder('stage', { diameter: STAGE.rx * 2, height: STAGE_Y, tessellation: 72 }, scene);
  stage.position.set(0, STAGE_Y / 2, STAGE.cz);
  stage.scaling.z = STAGE.rz / STAGE.rx;
  stage.material = mats.granite;
  stage.receiveShadows = true;
  track(stage);
  const top = B.MeshBuilder.CreateDisc('stageTop', { radius: STAGE.rx, tessellation: 72 }, scene);
  top.rotation.x = Math.PI / 2;
  top.position.set(0, STAGE_Y + 0.005, STAGE.cz);
  top.scaling.y = STAGE.rz / STAGE.rx;
  top.material = mats.stage;
  top.receiveShadows = true;
  track(top);
  const ring = B.MeshBuilder.CreateTorus('stageLed', { diameter: STAGE.rx * 2 + 0.2, thickness: 0.05, tessellation: 96 }, scene);
  ring.position.set(0, 0.06, STAGE.cz);
  ring.scaling.z = (STAGE.rz + 0.1) / (STAGE.rx + 0.1);
  ring.material = mats.led;
  track(ring);
  const lip = B.MeshBuilder.CreateTorus('stageLip', { diameter: STAGE.rx * 2, thickness: 0.05, tessellation: 96 }, scene);
  lip.position.set(0, STAGE_Y, STAGE.cz);
  lip.scaling.z = STAGE.rz / STAGE.rx;
  lip.material = mats.metal;
  track(lip);

  // ---------------------------------------------------------------- walls: stone and wood at the back, glass along both sides
  const wallZ = WALL_Z;
  box('backWall', [X * 2, H, 0.2], [0, H / 2, Z_BACK - 0.1], mats.stone);
  box('screenWall', [WING.x0 * 2 + 0.6, H, 0.14], [0, H / 2, wallZ - 0.07], mats.trim);
  box('screenHeader', [WING.x0 * 2 + 0.6, 0.35, 0.18], [0, SCREEN.y + SCREEN.h / 2 + 0.5, wallZ + 0.0], mats.dark);
  box('headerLed', [WING.x0 * 2, 0.03, 0.04], [0, SCREEN.y + SCREEN.h / 2 + 0.3, wallZ + 0.1], mats.ledWhite);
  const wingLen = (BOARD.x + 2 - WING.x0) / Math.cos(WING.angle) + 0.3;
  for (const s of [-1, 1] as const) {
    const g = new B.TransformNode('wing', scene);
    g.position.set(s * (WING.x0 + (wingLen / 2) * Math.cos(WING.angle)), H / 2, wallZ + (wingLen / 2) * Math.sin(WING.angle));
    g.rotation.y = -s * WING.angle;
    box('wingWood', [wingLen, H, 0.14], [0, 0, -0.07], wood(`cWoodW${s}`, wingLen / 1.4, 1.4), { parent: g });
    // stone panel above the board, like the reference
    box('wingStone', [wingLen * 0.52, 1.7, 0.1], [s * -0.2, 1.65, 0.02], mats.stone, { parent: g });
    box('wingLed', [wingLen, 0.035, 0.05], [0, -H / 2 + 1.15 + STAGE_Y, 0.05], mats.led, { parent: g });
    for (let i = 0; i < 2; i++) box('speaker', [0.5, 0.36, 0.4], [s * (wingLen / 2 - 0.55), 2.6 - i * 0.4, 0.24], mats.dark, { parent: g });
    const endZ = wallZ + wingLen * Math.sin(WING.angle);
    const endX = s * (WING.x0 + wingLen * Math.cos(WING.angle));
    box('wingEnd', [0.14, H, endZ - Z_BACK], [endX, H / 2, (endZ + Z_BACK) / 2], mats.stone);
    // glass curtain wall along the side with a dark frame
    const gl = B.MeshBuilder.CreatePlane('window', { width: Z_FRONT - Z_BACK, height: H }, scene);
    gl.position.set(s * (X - 0.02), H / 2, (Z_FRONT + Z_BACK) / 2);
    gl.rotation.y = (-s * Math.PI) / 2;
    gl.material = mats.glass;
    track(gl);
    box('sill', [0.12, 0.08, Z_FRONT - Z_BACK], [s * X, 0.04, (Z_FRONT + Z_BACK) / 2], mats.trim);
    box('transom', [0.1, 0.1, Z_FRONT - Z_BACK], [s * X, 3.5, (Z_FRONT + Z_BACK) / 2], mats.trim);
    box('headFrame', [0.14, 0.2, Z_FRONT - Z_BACK], [s * X, H - 0.1, (Z_FRONT + Z_BACK) / 2], mats.trim);
    for (let z = Z_BACK + 0.6; z < Z_FRONT; z += 2.6) box('mullion', [0.12, H, 0.12], [s * X, H / 2, z], mats.trim);
  }
  box('rearWall', [X * 2, H, 0.2], [0, H / 2, Z_FRONT + 0.1], mats.stone);

  // ---------------------------------------------------------------- the screen, the dashboard strip, the boards, the lectern
  box('screenFrame', [SCREEN.w + 0.16, SCREEN.h + 0.16, 0.14], [SCREEN.x, SCREEN.y, wallZ + 0.06], mats.dark, { cast: true });
  const dash = B.MeshBuilder.CreatePlane('dashboards', { width: SCREEN.w + 0.16, height: 0.82 }, scene);
  dash.position.set(0, SCREEN.y - SCREEN.h / 2 - 0.55, wallZ + 0.14);
  dash.rotation.y = Math.PI;
  const dm = new B.StandardMaterial('dashM', scene);
  dm.diffuseColor = B.Color3.Black();
  dm.emissiveTexture = canvasTex(scene, 'dashTex', 1280, 160, dashboards);
  dm.disableLighting = true;
  dash.material = dm;
  track(dash);
  for (const s of [-1, 1] as const) {
    const { pos, rotY } = boardPose(s);
    const g = new B.TransformNode('boardframe', scene);
    g.position.set(...pos);
    g.rotation.y = rotY;
    box('boardBack', [BOARD.w + 0.1, BOARD.h + 0.1, 0.1], [0, 0, 0.02], mats.dark, { parent: g });
  }
  const lec = new B.TransformNode('lectern', scene);
  lec.position.set(-2.4, STAGE_Y, -3.3);
  box('lecternBody', [0.8, 1.1, 0.6], [0, 0.55, 0], mats.dark, { parent: lec, cast: true });
  box('lecternTop', [0.9, 0.05, 0.66], [0, 1.12, 0], wood('cWoodLec', 1, 1), { parent: lec });
  box('lecternMonitor', [0.45, 0.3, 0.03], [0, 1.32, -0.1], mats.dark, { parent: lec });
  // planters with plants at the stage ends
  for (const s of [-1, 1]) {
    box('planter', [1.6, 0.5, 0.6], [s * 5.4, STAGE_Y + 0.25, -3.8], mats.pot);
    for (let i = 0; i < 8; i++) {
      const leaf = B.MeshBuilder.CreateCylinder('leaf', { diameterTop: 0.02, diameterBottom: 0.32, height: 0.8 + (i % 3) * 0.15, tessellation: 5 }, scene);
      leaf.position.set(s * 5.4 + (i - 3.5) * 0.19, STAGE_Y + 0.5 + 0.4, -3.8);
      leaf.rotation.z = (i - 3.5) * 0.12;
      leaf.material = mats.leaf;
      track(leaf);
    }
  }

  // ---------------------------------------------------------------- wood ceiling with a ring of light, light lines and the projector
  const ceil = B.MeshBuilder.CreatePlane('ceiling', { width: X * 2, height: Z_FRONT - Z_BACK }, scene);
  ceil.position.set(0, H, (Z_FRONT + Z_BACK) / 2);
  ceil.rotation.x = -Math.PI / 2;
  ceil.material = wood('cWoodCeil', 8, 9);
  track(ceil);
  const ringLight = B.MeshBuilder.CreateTorus('ringLight', { diameter: 7.6, thickness: 0.07, tessellation: 96 }, scene);
  ringLight.position.set(0, H - 0.2, 2.2);
  ringLight.material = mats.ledWhite;
  track(ringLight);
  const ringLight2 = B.MeshBuilder.CreateTorus('ringLight2', { diameter: 16, thickness: 0.05, tessellation: 96 }, scene);
  ringLight2.position.set(0, H - 0.1, 2.2);
  ringLight2.scaling.z = 0.75;
  ringLight2.material = mats.led;
  track(ringLight2);
  for (const s of [-1, 1]) {
    box('lightLine', [0.18, 0.05, 11], [s * 5.4, H - 0.03, 4], mats.dark);
    box('lightLineLed', [0.05, 0.03, 11], [s * 5.4, H - 0.07, 4], mats.ledWhite);
  }
  const downlight = B.MeshBuilder.CreateDisc('downlight', { radius: 0.09, tessellation: 12 }, scene);
  downlight.material = mats.ledWhite;
  downlight.rotation.x = Math.PI / 2;
  downlight.isVisible = false;
  for (const z of [-3, 0, 3, 6, 9, 12]) for (const x of [-7.5, -3.5, 3.5, 7.5]) downlight.createInstance('dl').position.set(x, H - 0.01, z);
  const rod = B.MeshBuilder.CreateCylinder('projRod', { diameter: 0.05, height: 0.6, tessellation: 8 }, scene);
  rod.position.set(0, H - 0.3, 2.2);
  rod.material = mats.metal;
  track(rod);
  box('projector', [0.8, 0.28, 0.7], [0, H - 0.74, 2.2], std('cProjector', '#d9dadf', { rough: 0.5 }));
  box('projectorLens', [0.22, 0.16, 0.1], [0, H - 0.74, 1.8], mats.dark);

  // ---------------------------------------------------------------- round tables with chairs (one of each is built, the rest are copies)
  const parts: B.Mesh[] = [];
  const part = (m: B.Mesh) => {
    parts.push(m);
    return m;
  };
  const chairParts = [
    part(Object.assign(B.MeshBuilder.CreateBox('seat', { width: 0.5, height: 0.07, depth: 0.5 }, scene), { position: new B.Vector3(0, 0.46, 0) })),
    part(Object.assign(B.MeshBuilder.CreateBox('back', { width: 0.5, height: 0.55, depth: 0.05 }, scene), { position: new B.Vector3(0, 0.78, 0.25) })),
    part(Object.assign(B.MeshBuilder.CreateCylinder('post', { diameter: 0.07, height: 0.42, tessellation: 8 }, scene), { position: new B.Vector3(0, 0.22, 0) })),
    part(Object.assign(B.MeshBuilder.CreateCylinder('base', { diameter: 0.55, height: 0.04, tessellation: 5 }, scene), { position: new B.Vector3(0, 0.03, 0) })),
  ];
  const chair = B.Mesh.MergeMeshes(chairParts, true, true) as B.Mesh;
  chair.material = mats.chair;
  chair.isVisible = false;
  const tableTop = B.MeshBuilder.CreateCylinder('tableTop', { diameter: 2.6, height: 0.06, tessellation: 40 }, scene);
  tableTop.position.y = 0.75;
  tableTop.material = mats.tableTop;
  tableTop.isVisible = false;
  const tableBase = B.MeshBuilder.CreateCylinder('tableBase', { diameter: 0.9, height: 0.72, tessellation: 24 }, scene);
  tableBase.position.y = 0.36;
  tableBase.material = mats.dark;
  tableBase.isVisible = false;
  const spots: [number, number][] = [[-6.2, 6.6], [6.2, 6.6], [0, 10.6], [-6.2, 12]].slice(0, quality === 'low' ? 2 : 4) as [number, number][];
  for (const [tx, tz] of spots) {
    const t = tableTop.createInstance('table');
    t.position.set(tx, 0.75, tz);
    t.receiveShadows = true;
    const b = tableBase.createInstance('tableBase');
    b.position.set(tx, 0.36, tz);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const c = chair.createInstance('chair');
      c.position.set(tx + Math.cos(a) * 1.7, 0, tz + Math.sin(a) * 1.7);
      c.rotation.y = -a + Math.PI / 2 + Math.PI; // each chair faces the table
    }
  }

  for (const m of meshes) if (!m.parent) m.freezeWorldMatrix();
}
