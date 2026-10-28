'use client';

import { useEffect, useRef, type ElementRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { ClassroomController } from '@/lib/classroom/controller';
import { CAM_PRESETS } from '@/lib/classroom/timeline';
import { clamp, ease } from '@/lib/util';

/** Vertical field of view for a landscape screen, the aspect it was tuned for, and the widest allowed on a phone. */
const BASE_FOV = 46;
const WIDE = 1.5;
const MAX_FOV = 80;
const SHORT_FOV = 62;
/** Zoom limits (metres from what the camera looks at), and the box the view may be panned within. */
const MIN_DIST = 2.4;
const MAX_DIST = 18;
const PAN_BOX = { x: [-7, 7], y: [0.8, 4.6], z: [-5.2, 1] } as const;

interface Tween {
  t: number;
  dur: number;
  fp: THREE.Vector3;
  ft: THREE.Vector3;
  pos: THREE.Vector3;
  tgt: THREE.Vector3;
}

/** Orbit controls plus eased camera moves requested by the lesson, and the side-panel view offset. */
export function CameraRig({ ctrl, panelPx }: { ctrl: ClassroomController; panelPx: number }) {
  const controls = useRef<ElementRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const seq = useRef(-1);
  const zoomSeq = useRef(0);
  const tween = useRef<Tween | null>(null);
  const tmp = useRef(new THREE.Vector3()).current;

  // Widen the field of view on narrow (portrait) screens so the screen and boards are not cropped, and shift the
  // projection so the scene centres in the space left of the side panel.
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const half = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
    const fov = aspect >= WIDE ? BASE_FOV : Math.min(MAX_FOV, THREE.MathUtils.radToDeg(2 * Math.atan((half * WIDE) / aspect)));
    // short screens (a phone on its side) lose a lot of height to the HUD, so give the scene more room
    camera.fov = size.height < 520 ? Math.max(fov, SHORT_FOV) : fov;
    if (panelPx && size.width > 900)
      camera.setViewOffset(size.width, size.height, panelPx / 2, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, panelPx]);

  useFrame((_, rawDt) => {
    const c = controls.current;
    const req = ctrl.camRequest;
    if (c && req.seq !== seq.current) {
      seq.current = req.seq;
      const p = CAM_PRESETS[req.name];
      const pos = new THREE.Vector3(...p.pos);
      const tgt = new THREE.Vector3(...p.tgt);
      if (req.instant || ctrl.reduced) {
        camera.position.copy(pos);
        c.target.copy(tgt);
        c.update();
        tween.current = null;
      } else tween.current = { t: 0, dur: 1.1, fp: camera.position.clone(), ft: c.target.clone(), pos, tgt };
    }
    const z = ctrl.zoomRequest;
    if (c && z.seq !== zoomSeq.current) {
      zoomSeq.current = z.seq;
      const off = camera.position.clone().sub(c.target);
      const len = THREE.MathUtils.clamp(off.length() * z.factor, MIN_DIST, MAX_DIST);
      const pos = c.target.clone().add(off.setLength(len));
      if (ctrl.reduced) camera.position.copy(pos);
      else tween.current = { t: 0, dur: 0.28, fp: camera.position.clone(), ft: c.target.clone(), pos, tgt: c.target.clone() };
    }
    const tw = tween.current;
    if (tw && c) {
      tw.t += Math.min(rawDt, 0.05) / tw.dur;
      const k = ease(clamp(tw.t, 0, 1));
      camera.position.lerpVectors(tw.fp, tw.pos, k);
      c.target.copy(tmp.lerpVectors(tw.ft, tw.tgt, k));
      if (tw.t >= 1) tween.current = null;
    }
    // panning (two fingers, or right-drag) can never carry the view away from the stage
    if (c) {
      const t = c.target;
      const cx = THREE.MathUtils.clamp(t.x, PAN_BOX.x[0], PAN_BOX.x[1]);
      const cy = THREE.MathUtils.clamp(t.y, PAN_BOX.y[0], PAN_BOX.y[1]);
      const cz = THREE.MathUtils.clamp(t.z, PAN_BOX.z[0], PAN_BOX.z[1]);
      if (cx !== t.x || cy !== t.y || cz !== t.z) {
        camera.position.add(tmp.set(cx - t.x, cy - t.y, cz - t.z));
        t.set(cx, cy, cz);
      }
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={MIN_DIST}
      maxDistance={MAX_DIST}
      minPolarAngle={Math.PI * 0.12}
      maxPolarAngle={Math.PI * 0.52}
      minAzimuthAngle={-1.25}
      maxAzimuthAngle={1.25}
      screenSpacePanning
      rotateSpeed={0.7}
      onStart={() => {
        tween.current = null;
        ctrl.userCamera();
      }}
    />
  );
}
