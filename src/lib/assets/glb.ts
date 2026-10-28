import type { GlbInfo } from '../store/types';

export interface GlbReport {
  ok: boolean;
  errors: string[];
  warns: string[];
  info: GlbInfo | null;
}

interface GltfJson {
  asset?: { generator?: string; version?: string };
  nodes?: unknown[];
  meshes?: { primitives?: { attributes?: { POSITION?: number } }[] }[];
  materials?: unknown[];
  textures?: unknown[];
  skins?: { joints?: number[] }[];
  animations?: { name?: string }[];
  accessors?: { min?: number[]; max?: number[] }[];
  buffers?: { uri?: string }[];
  extensionsRequired?: string[];
}

const SUPPORTED_EXT = /KHR_materials_|KHR_texture_transform|KHR_lights_punctual|KHR_mesh_quantization/;

/** Validates a GLB / glTF buffer without three.js: header, JSON chunk, required extensions, rig and clips. */
export function inspectGLB(buf: ArrayBuffer, ext: 'glb' | 'gltf'): GlbReport {
  const out: GlbReport = { ok: false, errors: [], warns: [], info: null };
  let j: GltfJson;
  try {
    if (ext === 'glb') {
      const dv = new DataView(buf);
      if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) {
        out.errors.push('Not a valid GLB file. The first four bytes should read “glTF”.');
        return out;
      }
      const ver = dv.getUint32(4, true);
      if (ver !== 2) out.errors.push(`GLB version ${ver} is not supported. Export as glTF 2.0.`);
      const len = dv.getUint32(12, true);
      const type = dv.getUint32(16, true);
      if (type !== 0x4e4f534a) {
        out.errors.push('The first chunk is not JSON, so the file is damaged.');
        return out;
      }
      j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len)));
    } else {
      j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
      if ((j.buffers ?? []).some((b) => b.uri && !/^data:/.test(b.uri)))
        out.errors.push('This .gltf points to separate files. Export a single .glb instead.');
    }
  } catch (e) {
    out.errors.push(`The file could not be parsed: ${e instanceof Error ? e.message : String(e)}`);
    return out;
  }
  const skins = j.skins ?? [];
  const info: GlbInfo = {
    generator: j.asset?.generator ?? 'unknown',
    version: j.asset?.version,
    nodes: (j.nodes ?? []).length,
    meshes: (j.meshes ?? []).length,
    materials: (j.materials ?? []).length,
    textures: (j.textures ?? []).length,
    skins: skins.length,
    joints: skins.reduce((s, k) => s + (k.joints?.length ?? 0), 0),
    animations: (j.animations ?? []).map((a, i) => a.name || `clip ${i + 1}`),
    height: 0,
  };
  const unsupported = (j.extensionsRequired ?? []).filter((x) => !SUPPORTED_EXT.test(x));
  if (unsupported.length)
    out.errors.push(
      `Requires ${unsupported.join(', ')}, which this viewer does not decode. Re-export without Draco or Meshopt compression.`,
    );
  let maxY = 0;
  let minY = 0;
  (j.meshes ?? []).forEach((m) =>
    (m.primitives ?? []).forEach((pr) => {
      const pos = pr.attributes?.POSITION;
      const a = pos === undefined ? undefined : j.accessors?.[pos];
      if (a?.max && a.min) {
        maxY = Math.max(maxY, a.max[1]);
        minY = Math.min(minY, a.min[1]);
      }
    }),
  );
  info.height = maxY - minY;
  if (!info.meshes) out.errors.push('The file has no meshes to show.');
  if (!info.skins)
    out.warns.push(
      'No skeleton found. It will show as a static prop with a gentle sway instead of gestures.',
    );
  if (!info.animations.length) out.warns.push('No animation clips. Gestures fall back to a procedural sway.');
  if (info.height && (info.height < 0.3 || info.height > 4))
    out.warns.push(`Height is about ${info.height.toFixed(2)} units. It will be rescaled to roughly 1.7 m.`);
  out.info = info;
  out.ok = !out.errors.length;
  return out;
}
