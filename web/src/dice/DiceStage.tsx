import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MODELS, qmul, topFace, type DieKind, type Quat } from './geometry.ts';
import { buildAtlas, buildGeometry, themeDieColors, type DieColors } from './mesh.ts';
import { landingRotation } from './symmetry.ts';
import type { Trajectory } from './physics.ts';
import { useSkinId } from '../lib/cardTheme/skin.ts';
import { useScheme } from '../lib/colorScheme.ts';

// Лоток с 3D-кубиком (ленивый чанк: three + r3f). Кубик проигрывает просчитанную траекторию и ложится
// числом сервера вверх: к повороту каждого кадра справа домножается симметрия тела R (symmetry.ts).

export type StageRoll = {
  key: string;
  kind: DieKind;
  traj: Trajectory | null;
  value: number | null;
};

const ARENA = 4.6;

function Die({
  roll,
  budget,
  minSpeed,
  colors: fixed,
  onImpact,
  onLanded,
}: {
  roll: StageRoll;
  budget: number;
  minSpeed: number;
  colors?: DieColors;
  onImpact?: (s: number) => void;
  onLanded?: () => void;
}) {
  const skin = useSkinId();
  const scheme = useScheme();
  const model = MODELS[roll.kind];
  const geometry = useMemo(() => buildGeometry(model), [model]);
  const [atlas, setAtlas] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let alive = true;
    const colors = fixed ?? themeDieColors();
    const make = () => alive && setAtlas((old) => (old?.dispose(), buildAtlas(model, colors)));
    make();
    document.fonts?.load(`600 40px ${colors.font}`).then(make, () => {});
    return () => {
      alive = false;
    };
  }, [model, skin, scheme, fixed]);

  const mesh = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const play = useRef<{ key: string; start: number; R: Quat; hits: number; landed: boolean } | null>(null);
  const shakeStart = useRef(0);
  // Покой до первого броска: наибольшая грань вверх, кубик лежит на лотке.
  const rest = useMemo(() => {
    const top = model.labels.indexOf(model.faces.length);
    const n = model.normals[top]!,
      c = model.centers[top]!;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(n[0], n[1], n[2]), new THREE.Vector3(0, 1, 0));
    const bottom = model.labels.indexOf(1);
    const cb = model.centers[bottom]!,
      nb = model.normals[bottom]!;
    return { q, y: Math.abs(cb[0] * nb[0] + cb[1] * nb[1] + cb[2] * nb[2]) || Math.hypot(c[0], c[1], c[2]) };
  }, [model]);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const now = state.clock.elapsedTime;
    const ready = roll.traj && roll.value != null;
    if (!ready) {
      // встряхивание над лотком, пока нет ответа сервера или физики
      if (!shakeStart.current) shakeStart.current = now;
      const t = now - shakeStart.current;
      if (roll.key) {
        m.position.set(Math.sin(t * 9) * 0.25, 2.4 + Math.sin(t * 13) * 0.2, Math.cos(t * 7) * 0.2);
        m.rotation.set(t * 7.3, t * 5.1, t * 6.7);
        invalidate();
      } else {
        m.position.set(0, rest.y, 0.4);
        m.quaternion.copy(rest.q);
      }
      return;
    }
    shakeStart.current = 0;
    const traj = roll.traj!;
    if (!play.current || play.current.key !== roll.key) {
      let R: Quat = [0, 0, 0, 1];
      try {
        R = landingRotation(model, traj.top, roll.value!);
      } catch (e) {
        console.warn('Кубик: не нашлась симметрия, показываю как есть', e);
      }
      play.current = { key: roll.key, start: now, R, hits: 0, landed: false };
    }
    const p = play.current;
    const n = traj.frames.length / 7;
    const duration = (n - 1) / traj.fps;
    const speed = Math.max(minSpeed, duration / budget);
    const f = Math.min(n - 1, (now - p.start) * speed * traj.fps);
    const i = Math.floor(f),
      j = Math.min(n - 1, i + 1),
      a = f - i;
    const F = traj.frames;
    const o1 = i * 7,
      o2 = j * 7;
    m.position.set(F[o1]! + (F[o2]! - F[o1]!) * a, F[o1 + 1]! + (F[o2 + 1]! - F[o1 + 1]!) * a, F[o1 + 2]! + (F[o2 + 2]! - F[o1 + 2]!) * a);
    const q1 = new THREE.Quaternion(F[o1 + 3], F[o1 + 4], F[o1 + 5], F[o1 + 6]);
    const q2 = new THREE.Quaternion(F[o2 + 3], F[o2 + 4], F[o2 + 5], F[o2 + 6]);
    const q = q1.slerp(q2, a);
    const r = qmul([q.x, q.y, q.z, q.w], p.R);
    m.quaternion.set(r[0], r[1], r[2], r[3]);
    while (p.hits < traj.impacts.length && traj.impacts[p.hits]!.frame <= f) onImpact?.(traj.impacts[p.hits++]!.strength);
    if (f >= n - 1) {
      if (!p.landed) {
        p.landed = true;
        const up = topFace(model, r);
        if (model.labels[up.face] !== roll.value) console.warn(`Кубик: вверху ${model.labels[up.face]}, сервер дал ${roll.value}`);
        if (import.meta.env.DEV)
          (window as unknown as { __zgLastDie?: unknown }).__zgLastDie = { kind: roll.kind, up: model.labels[up.face], value: roll.value, dot: +up.dot.toFixed(3) };
        onLanded?.();
      }
      return;
    }
    invalidate();
  });

  useEffect(() => {
    invalidate();
  }, [roll, atlas, invalidate]);

  return (
    <mesh ref={mesh} geometry={geometry} castShadow position={[0, 1, 0]}>
      {atlas && <meshStandardMaterial key={atlas.uuid} map={atlas} roughness={0.42} metalness={0.06} flatShading />}
    </mesh>
  );
}

/** Без лотка (стол): только тень кубика на прозрачном полу поверх сцены. */
function Floor() {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <shadowMaterial opacity={0.5} />
    </mesh>
  );
}

function Tray() {
  const skin = useSkinId();
  const scheme = useScheme();
  const [colors, setColors] = useState({ felt: '#ebefe6', rim: '#d5dccf' });
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setColors({ felt: cs.getPropertyValue('--surface-2').trim() || '#ebefe6', rim: cs.getPropertyValue('--border').trim() || '#d5dccf' });
  }, [skin, scheme]);
  // Оболочка (этап 38) рисует лоток сама (CSS): в сцене — только тень кубика, без круга и ободка.
  if (skin && document.documentElement.dataset.shell) return <Floor />;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[ARENA + 0.4, 72]} />
        <meshStandardMaterial color={colors.felt} roughness={0.95} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <ringGeometry args={[ARENA + 0.4, ARENA + 0.9, 72]} />
        <meshStandardMaterial color={colors.rim} roughness={0.8} />
      </mesh>
    </group>
  );
}

/**
 * budget — сколько секунд длится проигрывание (телефон 0,95, стол — до 2,5); minSpeed — не медленнее этого
 * (стол — 0,75 от настоящей скорости). floor — без лотка, кубик над сценой; colors — свои цвета граней вместо темы.
 */
export default function DiceStage({
  roll,
  budget = 0.95,
  minSpeed = 1,
  floor = false,
  colors,
  onImpact,
  onLanded,
  onLost,
  className,
}: {
  roll: StageRoll;
  budget?: number;
  minSpeed?: number;
  floor?: boolean;
  colors?: DieColors;
  onImpact?: (strength: number) => void;
  onLanded?: () => void;
  onLost?: () => void;
  className?: string;
}) {
  return (
    <Canvas
      className={className}
      aria-hidden="true"
      frameloop="demand"
      dpr={[1, 2]}
      shadows
      camera={{ position: [0, 10.5, 6.8], fov: 36 }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 0, 0.3);
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onLost?.();
        });
      }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight
        position={[-6, 12, 5]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      {floor ? <Floor /> : <Tray />}
      <Die roll={roll} budget={budget} minSpeed={minSpeed} colors={colors} onImpact={onImpact} onLanded={onLanded} />
    </Canvas>
  );
}
