import { useMemo } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { ClassroomController, InspectInfo } from '@/lib/classroom/controller';

/** Click-to-inspect handlers. Ignores drags (orbiting) and sets a pointer cursor on hover. */
export function usePick(ctrl: ClassroomController, info: InspectInfo) {
  const gl = useThree((s) => s.gl);
  return useMemo(
    () => ({
      onClick: (e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 5) return;
        e.stopPropagation();
        ctrl.select(e.object, info);
      },
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        gl.domElement.style.cursor = 'pointer';
      },
      onPointerOut: () => {
        gl.domElement.style.cursor = 'grab';
      },
    }),
    [ctrl, info, gl],
  );
}
