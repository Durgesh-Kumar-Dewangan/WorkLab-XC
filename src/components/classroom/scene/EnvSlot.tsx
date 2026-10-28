'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ClassroomController } from '@/lib/classroom/controller';
import { toast } from '@/lib/ui/toast';
import { Box } from './primitives';
import { STAGE, STAGE_Y } from './layout';
import { Room, type BuiltinEnv } from './Rooms';
import { useCustomGlb } from './useCustomGlb';

/** The hall's stage is a splat model; every other room gets a plain raised platform at the same height. */
function Platform() {
  return (
    <Box size={[STAGE.w, STAGE_Y, STAGE.d]} pos={[0, STAGE_Y / 2, STAGE.z]} color="#1b2036" rough={0.4} metal={0.3} />
  );
}

const BUILTIN: BuiltinEnv[] = ['classroom', 'lab', 'void'];

function GlbRoom({ scene }: { scene: THREE.Object3D }) {
  const root = useMemo(() => {
    if (!scene.userData.normalized) {
      const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
      scene.scale.multiplyScalar(Math.min(1, 16 / Math.max(size.x, size.z, 0.1)));
      scene.position.y -= new THREE.Box3().setFromObject(scene).min.y;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.receiveShadow = true;
      });
      scene.userData.normalized = true;
    }
    return scene;
  }, [scene]);
  return <primitive object={root} />;
}

/** The room: one of three built-ins, or the learner's own GLB (classroom fallback if it cannot load). */
export function EnvSlot({
  ctrl,
  id,
  onReady,
}: {
  ctrl: ClassroomController;
  id: string;
  onReady: () => void;
}) {
  const glb = useCustomGlb(id);
  useEffect(() => {
    if (glb.status === 'loading') return;
    if (glb.status === 'missing')
      toast('Your environment file is no longer stored in this browser. Using the classroom.', 'err');
    else if (glb.status === 'error')
      toast(`Your environment could not be loaded (${glb.error}). Using the classroom.`, 'err');
    onReady();
  }, [glb, onReady]);

  if (glb.status === 'loading') return null;
  if (glb.status === 'ready')
    return (
      <>
        <GlbRoom scene={glb.gltf.scene} />
        <Platform />
      </>
    );
  const builtin = BUILTIN.includes(id as BuiltinEnv) ? (id as BuiltinEnv) : 'classroom';
  return (
    <>
      <Room id={builtin} ctrl={ctrl} />
      {builtin === 'classroom' ? null : <Platform />}
    </>
  );
}
