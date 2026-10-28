'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ClassroomController } from '@/lib/classroom/controller';

/** Blue bounding box around whatever the learner last clicked. */
export function SelectionBox({ ctrl }: { ctrl: ClassroomController }) {
  const helper = useMemo(() => {
    const h = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color(0x2f7bff));
    h.visible = false;
    return h;
  }, []);
  useEffect(
    () => () => {
      helper.geometry.dispose();
      (helper.material as THREE.Material).dispose();
    },
    [helper],
  );
  useFrame(() => {
    const o = ctrl.selected;
    helper.visible = !!o;
    if (o) helper.box.setFromObject(o);
  });
  return <primitive object={helper} />;
}
