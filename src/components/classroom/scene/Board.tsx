'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ClassroomController, InspectInfo } from '@/lib/classroom/controller';
import { Box } from './primitives';
import { usePick } from './pick';
import { drawBoard } from './boardTexture';
import { SCREEN, SLIDE } from './layout';

const INFO: InspectInfo = {
  title: 'Presentation screen',
  body: 'The screen runs the lesson slides and builds each one up as the lesson plays. Click the progress bar or the outline to jump to any slide.',
};

/**
 * The presentation screen: a 1800×900 canvas texture redrawn only when the visible slide state changes.
 * In the lecture hall the screen itself is a splat model; the other rooms get a plain frame here.
 */
export function Board({ ctrl, envId }: { ctrl: ClassroomController; envId: string }) {
  const gl = useThree((s) => s.gl);
  const pick = usePick(ctrl, INFO);
  const { canvas, ctx, tex } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 900;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    return { canvas, ctx: canvas.getContext('2d')!, tex };
  }, []);
  const key = useRef('');

  useEffect(() => {
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    key.current = '';
    return () => tex.dispose();
  }, [tex, gl]);

  useFrame(() => {
    const d = ctrl.boardData();
    const k = `${d.idx}|${d.reveal.map((a) => Math.round(a * 4)).join('')}|${Math.round(d.formulaAlpha * 4)}|${Math.round(d.progress * 200)}|${d.photo ? 1 : 0}`;
    if (k !== key.current) {
      key.current = k;
      drawBoard(ctx, canvas.width, canvas.height, d);
      tex.needsUpdate = true;
    }
  });

  const hall = envId === 'classroom';
  return (
    <group>
      {hall ? null : (
        <Box
          size={[SLIDE.w + 0.4, SLIDE.h + 0.4, 0.12]}
          pos={[SCREEN.x, SCREEN.y, SLIDE.z - 0.07]}
          color="#1b1f33"
          rough={0.4}
          metal={0.4}
          {...pick}
        />
      )}
      <mesh position={[SCREEN.x, SCREEN.y, SLIDE.z]} {...pick}>
        <planeGeometry args={[SLIDE.w, SLIDE.h]} />
        <meshBasicMaterial map={tex} />
      </mesh>
    </group>
  );
}
