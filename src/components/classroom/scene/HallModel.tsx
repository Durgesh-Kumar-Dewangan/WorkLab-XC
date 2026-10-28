'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { ClassroomController, InspectInfo } from '@/lib/classroom/controller';
import { HALL_MODEL } from './layout';
import { usePick } from './pick';

const INFO: InspectInfo = {
  title: 'Stage and back wall',
  body: 'The lecture hall stage with its back wall, speakers and lectern. Replace the environment with your own GLB in the Library.',
};

const CARPET = new THREE.Color('#948f8a');
const EDGE = new THREE.Color('#4a4745');
const WOOD = new THREE.Color('#9a6a3c');
const SPEAKER = new THREE.Color('#15171c');

/** The model has no colours or materials, so paint it by what each surface is. */
function paint(geo: THREE.BufferGeometry) {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const { top } = HALL_MODEL;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const up = nor.getY(i) > 0.7;
    if (y < top - 0.012) c.copy(up ? CARPET : EDGE);
    else if (y > 0.12 && Math.abs(x) > 0.86) c.copy(SPEAKER);
    else if (up && y < top + 0.012) c.copy(CARPET);
    else c.copy(WOOD);
    colors.set([c.r, c.g, c.b], i * 3);
    // the scan is noisy; a perfectly flat stage floor is what lights evenly
    if (up && y < top + 0.012) nor.setXYZ(i, 0, 1, 0);
  }
  nor.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // the scanned stair handrails come out as shapeless strands; leave them out
  const idx = geo.getIndex();
  if (idx) {
    const keep: number[] = [];
    const rail = (v: number) => y3(pos, v) > top + 0.012 && Math.abs(pos.getX(v)) > 0.9 && pos.getZ(v) > -0.2;
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t);
      const b = idx.getX(t + 1);
      const d = idx.getX(t + 2);
      if (!(rail(a) && rail(b) && rail(d))) keep.push(a, b, d);
    }
    geo.setIndex(keep);
  }
}

const y3 = (pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) => pos.getY(i);

/** The stage module: platform, stairs, back wall with speakers, and the lectern, scaled to the hall. */
export function HallModel({ ctrl }: { ctrl: ClassroomController }) {
  const { scene } = useGLTF(HALL_MODEL.src);
  const pick = usePick(ctrl, INFO);
  const root = useMemo(() => {
    const g = scene.clone(true);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide });
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry = m.geometry.clone();
      paint(m.geometry);
      m.material = mat;
      // the scanned floor is slightly rippled, so letting it shadow itself shows as rings
      m.receiveShadow = true;
      m.castShadow = false;
    });
    return g;
  }, [scene]);
  const { scale, position } = HALL_MODEL;
  return <primitive object={root} scale={scale} position={position} {...pick} />;
}
