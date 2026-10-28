import { del, get, keys, set } from 'idb-keyval';

/**
 * Model files live in IndexedDB (never uploaded). The Zustand store only keeps the small metadata record,
 * so a reload keeps both the library list and the files themselves.
 */
export interface StoredAsset {
  buf: ArrayBuffer;
  ext: 'glb' | 'gltf';
}
const PREFIX = 'wlxc.asset:';

export const putAsset = (id: string, a: StoredAsset) => set(PREFIX + id, a);
export const getAsset = (id: string) => get<StoredAsset>(PREFIX + id);
export const delAsset = (id: string) => del(PREFIX + id);

export async function listAssetIds(): Promise<string[]> {
  try {
    return (await keys())
      .filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));
  } catch {
    return [];
  }
}

export async function clearAssets() {
  try {
    await Promise.all((await listAssetIds()).map(delAsset));
  } catch {
    /* IndexedDB unavailable: nothing was stored */
  }
}
