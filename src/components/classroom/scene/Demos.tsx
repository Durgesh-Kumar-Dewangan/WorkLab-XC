'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ClassroomController, InspectInfo } from '@/lib/classroom/controller';
import type { Sim } from '@/lib/domain/sim';
import { Box } from './primitives';
import { usePick } from './pick';

const rad = (d: number) => (d * Math.PI) / 180;

function makeTrail(n: number, color: number, opacity = 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setDrawRange(0, 0);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  line.frustumCulled = false;
  return line;
}
function fillTrail(
  line: THREE.Line,
  pts: [number, number][],
  map: (p: [number, number]) => [number, number, number],
) {
  const a = line.geometry.attributes.position as THREE.BufferAttribute;
  const n = Math.min(pts.length, a.count);
  for (let i = 0; i < n; i++) {
    const p = map(pts[pts.length - n + i]);
    a.array[i * 3] = p[0];
    a.array[i * 3 + 1] = p[1];
    a.array[i * 3 + 2] = p[2];
  }
  a.needsUpdate = true;
  line.geometry.setDrawRange(0, n);
}
function useDisposable<T extends THREE.Object3D>(make: () => T): T {
  const obj = useMemo(make, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
      });
    },
    [obj],
  );
  return obj;
}

/** Re-runs `apply` whenever the controller's parameter version changes. Cheap per-frame check, no React render. */
function useParamSync(ctrl: ClassroomController, apply: (S: Sim) => void) {
  const seen = useRef(-1);
  useFrame(() => {
    if (ctrl.S && seen.current !== ctrl.paramsVersion) {
      seen.current = ctrl.paramsVersion;
      apply(ctrl.S);
    }
  });
}

const Std = ({
  color,
  rough = 0.55,
  metal = 0.1,
  emissive,
  ei,
  wire,
}: {
  color: string;
  rough?: number;
  metal?: number;
  emissive?: string;
  ei?: number;
  wire?: boolean;
}) => (
  <meshStandardMaterial
    color={color}
    roughness={rough}
    metalness={metal}
    emissive={emissive}
    emissiveIntensity={ei}
    wireframe={wire}
  />
);

const CART_INFO: InspectInfo = {
  title: 'Cart on a track',
  body: 'Applied force (green arrow) and friction (red arrow) set the net force. Net force divided by mass gives acceleration. Use the Model tab to change them.',
};
function CartDemo({ ctrl }: { ctrl: ClassroomController }) {
  const cart = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const wheels = useRef<(THREE.Mesh | null)[]>([]);
  const fa = useDisposable(
    () =>
      new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0.4, 0),
        0.5,
        0x59f286,
        0.12,
        0.08,
      ),
  );
  const fr = useDisposable(
    () =>
      new THREE.ArrowHelper(
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 0.25, 0.2),
        0.3,
        0xff6b7a,
        0.1,
        0.07,
      ),
  );
  const pick = usePick(ctrl, CART_INFO);

  useFrame(() => {
    const S = ctrl.S;
    if (!S || !cart.current || !body.current) return;
    const s = S.s;
    const p = S.p;
    cart.current.position.x = s.x * 0.13;
    const m = 0.3 + p.mass * 0.035;
    body.current.scale.set(m / 0.4, 1, 1);
    wheels.current.forEach((w) => w && (w.rotation.y = -s.x * 5));
    const F = p.force;
    fa.visible = Math.abs(F) > 0.01;
    if (fa.visible) {
      fa.setDirection(new THREE.Vector3(Math.sign(F), 0, 0));
      fa.setLength(Math.abs(F) * 0.035 + 0.1, 0.12, 0.08);
      fa.position.set((Math.sign(F) * m) / 2, 0.4, 0);
    }
    const f = s.fr || 0;
    fr.visible = Math.abs(f) > 0.01;
    if (fr.visible) {
      fr.setDirection(new THREE.Vector3(Math.sign(f), 0, 0));
      fr.setLength(Math.abs(f) * 0.035 + 0.1, 0.1, 0.07);
      fr.position.set(Math.sign(f) * (m / 2), 0.25, 0.2);
    }
  });

  return (
    <group>
      <Box size={[3.2, 0.04, 0.34]} pos={[0, 0.02, 0]} color="#2a2f45" />
      {Array.from({ length: 11 }, (_, i) => i - 5).map((i) => (
        <Box key={i} size={[0.01, 0.045, 0.34]} pos={[i * 0.28, 0.022, 0]} color="#59627f" />
      ))}
      <group ref={cart}>
        <mesh ref={body} position={[0, 0.17, 0]} castShadow receiveShadow {...pick}>
          <boxGeometry args={[0.4, 0.18, 0.26]} />
          <Std color="#2f7bff" />
        </mesh>
        {(
          [
            [-0.14, -0.14],
            [0.14, -0.14],
            [-0.14, 0.14],
            [0.14, 0.14],
          ] as const
        ).map(([x, z], i) => (
          <mesh
            key={i}
            ref={(o) => void (wheels.current[i] = o)}
            position={[x, 0.07, z * 1.08]}
            rotation-x={Math.PI / 2}
          >
            <cylinderGeometry args={[0.05, 0.05, 0.04, 16]} />
            <Std color="#e8eefc" />
          </mesh>
        ))}
        <primitive object={fa} />
        <primitive object={fr} />
      </group>
    </group>
  );
}

const LAUNCH_INFO: InspectInfo = {
  title: 'Launcher',
  body: 'The launch angle and speed set the starting velocity. Gravity then acts only downward, so the horizontal speed never changes.',
};
const BALL_INFO: InspectInfo = {
  title: 'Projectile',
  body: 'Moves sideways at constant speed while falling with constant acceleration. The faint curve is the predicted path.',
};
function ProjectileDemo({ ctrl }: { ctrl: ClassroomController }) {
  const x0 = -1.5;
  const sc = useRef(0.05);
  const cannon = useRef<THREE.Mesh>(null);
  const ball = useRef<THREE.Mesh>(null);
  const trail = useDisposable(() => makeTrail(420, 0x2f7bff));
  const pred = useDisposable(() => makeTrail(61, 0x8a8a99, 0.55));
  const pCannon = usePick(ctrl, LAUNCH_INFO);
  const pBall = usePick(ctrl, BALL_INFO);

  useParamSync(ctrl, (S) => {
    const p = S.p;
    const R = Math.max(10, ((p.speed * p.speed * Math.sin(2 * rad(p.angle))) / p.gravity) * 1.1);
    const H = Math.max(3, (Math.pow(p.speed * Math.sin(rad(p.angle)), 2) / (2 * p.gravity)) * 1.2);
    sc.current = Math.min(3 / R, 1.6 / H);
    if (cannon.current) {
      cannon.current.position.set(x0, 0.1, 0);
      cannon.current.rotation.z = -(Math.PI / 2 - rad(p.angle));
    }
    const T = (2 * p.speed * Math.sin(rad(p.angle))) / p.gravity;
    const a = pred.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i <= 60; i++) {
      const t = (T * i) / 60;
      a.array[i * 3] = x0 + p.speed * Math.cos(rad(p.angle)) * t * sc.current;
      a.array[i * 3 + 1] =
        0.05 + (p.speed * Math.sin(rad(p.angle)) * t - (p.gravity * t * t) / 2) * sc.current;
      a.array[i * 3 + 2] = 0;
    }
    a.needsUpdate = true;
    pred.geometry.setDrawRange(0, 61);
  });
  useFrame(() => {
    const S = ctrl.S;
    if (!S || !ball.current) return;
    ball.current.position.set(x0 + S.s.x * sc.current, 0.05 + S.s.y * sc.current, 0);
    fillTrail(trail, S.trail, (q) => [x0 + q[0] * sc.current, 0.05 + q[1] * sc.current, 0]);
  });

  return (
    <group>
      <Box size={[3.4, 0.03, 0.5]} pos={[0, 0.015, 0]} color="#2a2f45" />
      <mesh ref={cannon} castShadow {...pCannon}>
        <cylinderGeometry args={[0.05, 0.07, 0.4, 14]} />
        <Std color="#59627f" />
      </mesh>
      <mesh ref={ball} castShadow {...pBall}>
        <sphereGeometry args={[0.06, 16, 12]} />
        <Std color="#ffb84d" emissive="#ffb84d" ei={0.35} />
      </mesh>
      <primitive object={trail} />
      <primitive object={pred} />
    </group>
  );
}

const BOB_INFO: InspectInfo = {
  title: 'Pendulum bob',
  body: 'Gravity pulls it down, the string pulls it inward. It is fastest at the lowest point, where potential energy has turned into kinetic energy.',
};
function PendulumDemo({ ctrl }: { ctrl: ClassroomController }) {
  const piv = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Mesh>(null);
  const bob = useRef<THREE.Mesh>(null);
  const len = useRef(1);
  const trail = useDisposable(() => makeTrail(300, 0x7c4dff, 0.6));
  const pick = usePick(ctrl, BOB_INFO);

  useParamSync(ctrl, (S) => {
    len.current = 0.6 + S.p.length * 0.42;
    if (rod.current) {
      rod.current.scale.y = len.current;
      rod.current.position.y = -len.current / 2;
    }
  });
  useFrame(() => {
    const S = ctrl.S;
    if (!S || !piv.current || !bob.current) return;
    piv.current.rotation.z = -S.s.th;
    bob.current.position.set(0, -len.current, 0);
    const k = len.current / S.p.length;
    fillTrail(trail, S.trail, (q) => [q[0] * k, 1.86 + q[1] * k, 0]);
  });

  return (
    <group>
      <Box size={[1.3, 0.05, 0.3]} pos={[0, 1.9, 0]} color="#59627f" />
      <Box size={[0.05, 1.9, 0.05]} pos={[-0.62, 0.95, 0]} color="#59627f" />
      <Box size={[0.05, 1.9, 0.05]} pos={[0.62, 0.95, 0]} color="#59627f" />
      <group ref={piv} position={[0, 1.86, 0]}>
        <mesh ref={rod}>
          <cylinderGeometry args={[0.008, 0.008, 1, 6]} />
          <Std color="#e8eefc" />
        </mesh>
        <mesh ref={bob} castShadow {...pick}>
          <sphereGeometry args={[0.1, 20, 16]} />
          <Std color="#7c4dff" metal={0.3} rough={0.35} />
        </mesh>
      </group>
      <primitive object={trail} />
    </group>
  );
}

const STAR_INFO: InspectInfo = {
  title: 'Central body',
  body: 'Its mass sets how strongly it pulls. A larger mass means a higher circular speed at the same distance.',
};
const SAT_INFO: InspectInfo = {
  title: 'Satellite',
  body: 'It is always falling toward the centre, and moving sideways fast enough to keep missing. Try lowering its speed below 1× to see it spiral in.',
};
function OrbitDemo({ ctrl }: { ctrl: ClassroomController }) {
  const su = 0.2;
  const star = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const sat = useRef<THREE.Mesh>(null);
  const trail = useDisposable(() => makeTrail(700, 0x2f7bff));
  const pStar = usePick(ctrl, STAR_INFO);
  const pSat = usePick(ctrl, SAT_INFO);

  useParamSync(ctrl, (S) => {
    star.current?.scale.setScalar(0.11 + S.p.orbitMass / 700);
    ring.current?.scale.setScalar(S.p.radius * su);
  });
  useFrame(() => {
    const S = ctrl.S;
    if (!S || !sat.current) return;
    sat.current.visible = !S.s.crashed;
    sat.current.position.set(S.s.x * su, 0.8, -S.s.y * su);
    fillTrail(trail, S.trail, (q) => [q[0] * su, 0.8, -q[1] * su]);
  });

  return (
    <group>
      <mesh ref={star} position={[0, 0.8, 0]} {...pStar}>
        <sphereGeometry args={[1, 28, 20]} />
        <Std color="#ffb84d" emissive="#ffb84d" ei={0.9} />
      </mesh>
      <pointLight position={[0, 0.8, 0]} color={0xffd8a0} intensity={2.4} distance={4} decay={1} />
      <mesh ref={sat} castShadow {...pSat}>
        <sphereGeometry args={[0.06, 16, 12]} />
        <Std color="#e8eefc" metal={0.3} />
      </mesh>
      <primitive object={trail} />
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.8, 0]}>
        <ringGeometry args={[0.995, 1, 64]} />
        <meshBasicMaterial color={0x59627f} side={THREE.DoubleSide} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

const ICO_INFO: InspectInfo = {
  title: 'Concept placeholder',
  body: 'This course was built from a syllabus heading, so there is no physical model for it. The lesson uses the board only.',
};
function ConceptDemo({ ctrl }: { ctrl: ClassroomController }) {
  const ico = useRef<THREE.Mesh>(null);
  const small = useRef<THREE.Mesh>(null);
  const pick = usePick(ctrl, ICO_INFO);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ico.current) {
      ico.current.rotation.y = t * 0.5;
      ico.current.rotation.x = t * 0.3;
    }
    small.current?.position.set(
      Math.cos(t * 1.2) * 0.6,
      0.9 + Math.sin(t * 0.8) * 0.2,
      Math.sin(t * 1.2) * 0.6,
    );
  });
  return (
    <group>
      <mesh ref={ico} position={[0, 0.9, 0]} {...pick}>
        <icosahedronGeometry args={[0.35, 1]} />
        <Std color="#7c4dff" emissive="#7c4dff" ei={0.6} wire />
      </mesh>
      <mesh ref={small}>
        <sphereGeometry args={[0.07, 12, 10]} />
        <Std color="#59f286" emissive="#59f286" ei={0.8} />
      </mesh>
    </group>
  );
}

export function Demo({ ctrl }: { ctrl: ClassroomController }) {
  switch (ctrl.topic.demo) {
    case 'cart':
      return <CartDemo ctrl={ctrl} />;
    case 'projectile':
      return <ProjectileDemo ctrl={ctrl} />;
    case 'pendulum':
      return <PendulumDemo ctrl={ctrl} />;
    case 'orbit':
      return <OrbitDemo ctrl={ctrl} />;
    default:
      return <ConceptDemo ctrl={ctrl} />;
  }
}
