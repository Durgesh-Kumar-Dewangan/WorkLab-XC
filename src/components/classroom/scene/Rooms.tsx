'use client';

import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ClassroomController } from '@/lib/classroom/controller';
import { Box } from './primitives';
import { woodWallCanvas } from './boardTexture';
import { BOARD, SCREEN, STAGE_Y, WALL_Z, boardPose } from './layout';
import { HallModel } from './HallModel';
import { SideBoards } from './SideBoards';

function ClassroomRoom({ ctrl }: { ctrl: ClassroomController }) {
  const wood = useMemo(() => {
    const t = new THREE.CanvasTexture(woodWallCanvas());
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(5.5, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => wood.dispose(), [wood]);
  return (
    <group>
      {/* floor, walls and ceiling */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 6]} receiveShadow>
        <planeGeometry args={[20, 22]} />
        <meshStandardMaterial color="#8f8c86" roughness={0.45} metalness={0.05} />
      </mesh>
      <mesh position={[0, 3.25, -4.99]}>
        <planeGeometry args={[20, 6.5]} />
        <meshStandardMaterial map={wood} roughness={0.55} />
      </mesh>
      <Box size={[0.2, 6.5, 22]} pos={[-10, 3.25, 6]} color="#a39c8e" rough={0.95} cast={false} />
      <Box size={[0.2, 6.5, 22]} pos={[10, 3.25, 6]} color="#a39c8e" rough={0.95} cast={false} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 9.89, 3.25, -0.5]} rotation-y={(-s * Math.PI) / 2}>
          <planeGeometry args={[9, 6.5]} />
          <meshStandardMaterial map={wood} roughness={0.55} />
        </mesh>
      ))}
      <Box size={[20, 0.2, 22]} pos={[0, 6.6, 6]} color="#cdbfa6" rough={1} cast={false} />
      {[-3.5, 0.5, 4.5].map((z) => (
        <group key={z}>
          <Box size={[8, 0.04, 0.12]} pos={[-5, 6.47, z]} color="#ffffff" emissive="#ffffff" ei={1.4} cast={false} />
          <Box size={[8, 0.04, 0.12]} pos={[5, 6.47, z]} color="#ffffff" emissive="#ffffff" ei={1.4} cast={false} />
        </group>
      ))}
      <Box size={[0.9, 0.3, 0.8]} pos={[0, 6.3, 2.6]} color="#d8d8dc" rough={0.5} cast={false} />

      {/* stage module, then the screen frame, board frames and the dark panel under the screen */}
      <Suspense fallback={null}>
        <HallModel ctrl={ctrl} />
      </Suspense>
      <Box size={[SCREEN.w, 0.85, 0.12]} pos={[0, STAGE_Y + 0.43, WALL_Z + 0.07]} color="#1d1f24" rough={0.6} />
      <Box size={[SCREEN.w, SCREEN.h, 0.12]} pos={[SCREEN.x, SCREEN.y, WALL_Z + 0.07]} color="#15171c" rough={0.5} />
      {([-1, 1] as const).map((s) => {
        const { pos, rotY } = boardPose(s);
        return (
          <group key={s} position={pos} rotation-y={rotY}>
            <Box size={[BOARD.w, BOARD.h, 0.1]} pos={[0, 0, 0.02]} color="#c9ccd2" metal={0.4} rough={0.4} />
          </group>
        );
      })}
      <SideBoards ctrl={ctrl} />
    </group>
  );
}

function LabRoom() {
  const flasks = ['#59f286', '#ffb84d', '#d46bff'];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[18, 16]} />
        <meshStandardMaterial color="#12151f" roughness={0.6} metalness={0.2} />
      </mesh>
      <gridHelper args={[18, 36, 0x2f7bff, 0x232a44]} position={[0, 0.01, 0]} />
      <Box size={[18, 4.6, 0.2]} pos={[0, 2.3, -5.1]} color="#0c1020" rough={0.9} cast={false} />
      <group position={[0, STAGE_Y, 0]}>
      <Box size={[5, 0.1, 1]} pos={[-5.5, 0.9, -4.3]} color="#2a3150" rough={0.4} metal={0.3} />
      <Box size={[4.8, 0.85, 0.9]} pos={[-5.5, 0.42, -4.3]} color="#161a2c" />
      {flasks.map((c, i) => (
        <mesh key={c} position={[-6.5 + i * 0.5, 1.12, -4.3]}>
          <cylinderGeometry args={[0.1, 0.14, 0.24, 14]} />
          <meshStandardMaterial
            color={c}
            emissive={c}
            emissiveIntensity={0.5}
            transparent
            opacity={0.85}
            roughness={0.8}
          />
        </mesh>
      ))}
      </group>
      {[-7, 7].map((x) => (
        <Box
          key={x}
          size={[0.1, 4, 0.1]}
          pos={[x, 2, -5]}
          color="#2f7bff"
          emissive="#2f7bff"
          ei={1}
          cast={false}
        />
      ))}
    </group>
  );
}

function VoidRoom() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0e1018" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[5.5, 5.55, 80]} />
        <meshBasicMaterial color={0x2f7bff} side={THREE.DoubleSide} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

export type BuiltinEnv = 'classroom' | 'lab' | 'void';
export function Room({ id, ctrl }: { id: BuiltinEnv; ctrl: ClassroomController }) {
  if (id === 'lab') return <LabRoom />;
  if (id === 'void') return <VoidRoom />;
  return <ClassroomRoom ctrl={ctrl} />;
}
