import type { ThreeElements } from '@react-three/fiber';

type V3 = [number, number, number];
interface BoxProps extends Omit<ThreeElements['mesh'], 'position' | 'args'> {
  size: V3;
  pos: V3;
  color: string;
  rough?: number;
  metal?: number;
  emissive?: string;
  ei?: number;
  cast?: boolean;
  transparent?: boolean;
  opacity?: number;
}

/** Box mesh with a standard material; the building block for rooms and props. */
export function Box({
  size,
  pos,
  color,
  rough = 0.8,
  metal = 0,
  emissive,
  ei,
  cast = true,
  transparent,
  opacity,
  ...rest
}: BoxProps) {
  return (
    <mesh position={pos} castShadow={cast} receiveShadow {...rest}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={rough}
        metalness={metal}
        emissive={emissive}
        emissiveIntensity={ei}
        transparent={transparent}
        opacity={opacity}
      />
    </mesh>
  );
}
