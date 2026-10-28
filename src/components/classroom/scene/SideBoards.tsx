'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ClassroomController, InspectInfo } from '@/lib/classroom/controller';
import { formulaText } from '@/lib/classroom/timeline';
import { drawSideBoard, type SideContent } from './boardTexture';
import { BOARD, boardPose } from './layout';
import { usePick } from './pick';

const CW = 1320;
const CH = 620;

const LEFT: InspectInfo = {
  title: 'Left whiteboard',
  body: 'Explains the current slide in words, so you can read along with the narration.',
};
const RIGHT: InspectInfo = {
  title: 'Right whiteboard',
  body: 'Shows the question for the current slide as it comes up, or its formula. It stays blank when a slide has neither.',
};

function useFace() {
  const gl = useThree((s) => s.gl);
  const f = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    return { canvas, ctx: canvas.getContext('2d')!, tex };
  }, []);
  useEffect(() => {
    f.tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return () => f.tex.dispose();
  }, [f, gl]);
  return f;
}

/** The two whiteboards: left explains in words (the narration), right holds the formula. Redrawn only when the slide changes. */
export function SideBoards({ ctrl }: { ctrl: ClassroomController }) {
  const left = useFace();
  const right = useFace();
  const pickL = usePick(ctrl, LEFT);
  const pickR = usePick(ctrl, RIGHT);
  const idx = useRef(-1);
  useEffect(() => {
    idx.current = -1;
  }, [left, right]);

  useFrame(() => {
    const i = ctrl.boardData().idx;
    if (i === idx.current) return;
    idx.current = i;
    const s = ctrl.topic.slides[i];
    const say: SideContent = s?.say ? { kind: 'say', head: 'In words', text: s.say } : { kind: 'blank' };
    const f = s?.f && formulaText(s.f);
    const right_: SideContent = s?.check
      ? { kind: 'question', head: 'Question', text: s.check.q, opts: s.check.opts }
      : f
        ? { kind: 'formula', head: 'Formula', text: f }
        : { kind: 'blank' };
    drawSideBoard(left.ctx, CW, CH, say);
    left.tex.needsUpdate = true;
    drawSideBoard(right.ctx, CW, CH, right_);
    right.tex.needsUpdate = true;
  });

  return (
    <group>
      {(
        [
          [-1, left, pickL],
          [1, right, pickR],
        ] as const
      ).map(([side, face, pick]) => {
        const { pos, rotY } = boardPose(side);
        return (
          <group key={side} position={pos} rotation-y={rotY}>
            <mesh position={[0, 0, 0.08]} {...pick}>
              <planeGeometry args={[BOARD.face.w, BOARD.face.h]} />
              <meshBasicMaterial map={face.tex} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
