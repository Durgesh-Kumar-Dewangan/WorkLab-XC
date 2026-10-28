'use client';

import { useEffect, useState } from 'react';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getAsset } from '@/lib/assets/store';

export type GlbState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; gltf: GLTF }
  | { status: 'missing' }
  | { status: 'error'; error: string };

const isCustom = (id: string | null | undefined): id is string => !!id && id.startsWith('custom-');

/** Loads a user-supplied GLB from IndexedDB and parses it. Built-in ids resolve to { status: 'none' }. */
export function useCustomGlb(id: string | null | undefined): GlbState {
  const [res, setRes] = useState<{ id: string; state: GlbState } | null>(null);

  useEffect(() => {
    if (!isCustom(id)) return;
    let alive = true;
    (async () => {
      let state: GlbState;
      try {
        const a = await getAsset(id);
        if (!a) state = { status: 'missing' };
        else state = { status: 'ready', gltf: await new GLTFLoader().parseAsync(a.buf.slice(0), '') };
      } catch (e) {
        state = { status: 'error', error: e instanceof Error ? e.message : 'Could not parse the file' };
      }
      if (alive) setRes({ id, state });
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (!isCustom(id)) return { status: 'none' };
  return res && res.id === id ? res.state : { status: 'loading' };
}
