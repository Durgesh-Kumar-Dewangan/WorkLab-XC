import * as B from '@babylonjs/core';
import { woodWallCanvas } from '../scene/boardTexture';
import { BOARD, HALL_MODEL, SCREEN, STAGE_Y, WALL_Z, boardPose } from '../scene/layout';

/**
 * The earlier hall: a scanned stage model (public/models/hall/stage-lite.glb) inside a simple painted room.
 * Kept as a Settings choice beside the hall that is built from code (hall.ts).
 */
const HALL_SRC = '/models/hall/stage-lite.glb';

type V3 = [number, number, number];

function material(scene: B.Scene, color: string, rough = 0.8) {
  const m = new B.StandardMaterial(`m-${color}-${Math.random().toString(36).slice(2, 7)}`, scene);
  m.diffuseColor = B.Color3.FromHexString(color);
  const spec = 0.32 * (1 - rough);
  m.specularColor = new B.Color3(spec, spec, spec);
  return m;
}

export function buildHallModelRoom(scene: B.Scene, shadow: B.ShadowGenerator | null) {
  const box = (size: V3, pos: V3, color: string, cast = true, emissive = false) => {
    const b = B.MeshBuilder.CreateBox('box', { width: size[0], height: size[1], depth: size[2] }, scene);
    b.position.set(...pos);
    const m = material(scene, color, 0.8);
    if (emissive) m.emissiveColor = B.Color3.FromHexString(color).scale(0.98);
    b.material = m;
    b.receiveShadows = true;
    if (shadow && cast) shadow.addShadowCaster(b);
    return b;
  };
  // each wall gets its own copy of the painted wood, because a texture repeats by a fixed factor
  const woodMat = (u: number) => {
    const src = woodWallCanvas();
    const t = new B.DynamicTexture('wood', { width: src.width, height: src.height }, scene, true);
    (t.getContext() as unknown as CanvasRenderingContext2D).drawImage(src, 0, 0);
    t.update(true);
    t.wrapU = B.Texture.WRAP_ADDRESSMODE;
    t.uScale = u;
    const m = new B.StandardMaterial('woodMat', scene);
    m.diffuseTexture = t;
    m.specularColor = new B.Color3(0.08, 0.08, 0.08);
    return m;
  };
  const floor = B.MeshBuilder.CreateGround('floor', { width: 20, height: 22 }, scene);
  floor.position.set(0, 0, 6);
  floor.material = material(scene, '#8f8c86', 0.45);
  floor.receiveShadows = true;
  const back = B.MeshBuilder.CreatePlane('backwall', { width: 20, height: 6.5 }, scene);
  back.position.set(0, 3.25, -4.99);
  back.material = woodMat(5.5);
  box([0.2, 6.5, 22], [-10, 3.25, 6], '#a39c8e', false);
  box([0.2, 6.5, 22], [10, 3.25, 6], '#a39c8e', false);
  for (const s of [-1, 1]) {
    const w = B.MeshBuilder.CreatePlane('sidewall', { width: 9, height: 6.5 }, scene);
    w.position.set(s * 9.89, 3.25, -0.5);
    w.rotation.y = (-s * Math.PI) / 2;
    w.material = woodMat(2.5);
  }
  box([20, 0.2, 22], [0, 6.6, 6], '#cdbfa6', false);
  for (const z of [-3.5, 0.5, 4.5]) for (const x of [-5, 5]) box([8, 0.04, 0.12], [x, 6.47, z], '#ffffff', false, true);
  box([0.9, 0.3, 0.8], [0, 6.3, 2.6], '#d8d8dc', false);
  // the panel under the screen, the screen frame and the board frames
  box([SCREEN.w, 0.85, 0.12], [0, STAGE_Y + 0.43, WALL_Z + 0.07], '#1d1f24');
  box([SCREEN.w, SCREEN.h, 0.12], [SCREEN.x, SCREEN.y, WALL_Z + 0.07], '#15171c');
  for (const s of [-1, 1] as const) {
    const { pos, rotY } = boardPose(s);
    const g = new B.TransformNode('boardframe', scene);
    g.position.set(...pos);
    g.rotation.y = rotY;
    const f = B.MeshBuilder.CreateBox('boardBack', { width: BOARD.w, height: BOARD.h, depth: 0.1 }, scene);
    f.parent = g;
    f.position.z = 0.02;
    f.material = material(scene, '#c9ccd2', 0.4);
  }
}

/** The stage model: platform, stairs, back wall with speakers and a lectern. Painted by surface, since the model has no colours. */
export async function loadHallModel(scene: B.Scene) {
  const res = await B.ImportMeshAsync(HALL_SRC, scene);
  const root = new B.TransformNode('hall', scene);
  root.scaling.setAll(HALL_MODEL.scale);
  root.position.set(...HALL_MODEL.position);
  const CARPET = B.Color3.FromHexString('#948f8a');
  const EDGE = B.Color3.FromHexString('#4a4745');
  const WOOD = B.Color3.FromHexString('#9a6a3c');
  const SPEAKER = B.Color3.FromHexString('#15171c');
  const top = HALL_MODEL.top;
  const mat = new B.StandardMaterial('hallMat', scene);
  mat.diffuseColor = B.Color3.White();
  mat.specularColor = new B.Color3(0.05, 0.05, 0.05);
  mat.backFaceCulling = false;
  for (const m of res.meshes) {
    if (!m.parent) m.parent = root;
    const mesh = m as B.Mesh;
    const pos = mesh.getVerticesData?.(B.VertexBuffer.PositionKind);
    const idx = mesh.getIndices?.();
    if (!pos || !idx) continue;
    const nor = new Float32Array(pos.length);
    B.VertexData.ComputeNormals(pos, idx, nor, { useRightHandedSystem: true });
    const n = pos.length / 3;
    const col = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const up = nor[i * 3 + 1] > 0.7;
      const c = y < top - 0.012 ? (up ? CARPET : EDGE) : y > 0.12 && Math.abs(x) > 0.86 ? SPEAKER : up && y < top + 0.012 ? CARPET : WOOD;
      col.set([c.r, c.g, c.b, 1], i * 4);
      if (up && y < top + 0.012) nor.set([0, 1, 0], i * 3);
    }
    // the scanned stair handrails come out as shapeless strands; leave them out
    const rail = (v: number) => pos[v * 3 + 1] > top + 0.012 && Math.abs(pos[v * 3]) > 0.9 && pos[v * 3 + 2] > -0.2;
    const keep: number[] = [];
    for (let t = 0; t < idx.length; t += 3) if (!(rail(idx[t]) && rail(idx[t + 1]) && rail(idx[t + 2]))) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    mesh.setVerticesData(B.VertexBuffer.NormalKind, nor, false);
    mesh.setVerticesData(B.VertexBuffer.ColorKind, col, false);
    mesh.setIndices(keep);
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
  }
}
