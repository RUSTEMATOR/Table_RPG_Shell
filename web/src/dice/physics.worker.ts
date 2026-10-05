/// <reference lib="webworker" />
import RAPIER from '@dimforge/rapier3d-compat';
import { MODELS, topFace, type DieKind, type Quat } from './geometry.ts';

// Физика броска в фоне (Rapier, WebAssembly). Кубик честно бросается в круглый лоток; запись — 30 кадров/с.
// Результат физики (верхняя грань) потом «переименовывается» симметрией тела под число сервера (symmetry.ts).

export type ThrowRequest = { id: number; kind: DieKind; seed: number; angle: number; power: number };
export type Trajectory = {
  id: number;
  kind: DieKind;
  fps: number;
  /** x, y, z, qx, qy, qz, qw на кадр */
  frames: Float32Array;
  impacts: { frame: number; strength: number }[];
  top: number;
};

const FPS = 30, DT = 1 / 120, SUB = 4, MAX_T = 2.2, ARENA = 4.6;
let ready: Promise<void> | null = null;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomQuat(r: () => number): Quat {
  const u1 = r(), u2 = r() * Math.PI * 2, u3 = r() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

function simulate(req: ThrowRequest, attempt: number): Trajectory | null {
  const model = MODELS[req.kind];
  const r = rng(req.seed + attempt * 7919);
  const world = new RAPIER.World({ x: 0, y: -42, z: 0 });
  world.timestep = DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0).setFriction(0.8).setRestitution(0.3));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.4, 4, 1.4).setTranslation(Math.cos(a) * (ARENA + 0.4), 4, Math.sin(a) * (ARENA + 0.4)).setRotation({ x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) }).setRestitution(0.45),
    );
  }
  const start = req.angle + (r() - 0.5) * 0.5;
  const q0 = randomQuat(r);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(Math.cos(start) * (ARENA - 1.4), 2.2 + r() * 1.4, Math.sin(start) * (ARENA - 1.4))
      .setRotation({ x: q0[0], y: q0[1], z: q0[2], w: q0[3] })
      .setLinearDamping(0.25)
      .setAngularDamping(0.6)
      .setCcdEnabled(true),
  );
  const pts = new Float32Array(model.vertices.flatMap((v) => [v[0], v[1], v[2]]));
  const hull = RAPIER.ColliderDesc.convexHull(pts);
  if (!hull) return null;
  world.createCollider(hull.setDensity(1.2).setFriction(0.55).setRestitution(0.38), body);
  const speed = (6 + r() * 4) * (0.75 + req.power * 0.5);
  const toCenter = start + Math.PI + (r() - 0.5) * 0.6;
  body.setLinvel({ x: Math.cos(toCenter) * speed, y: -2 - r() * 3, z: Math.sin(toCenter) * speed }, true);
  body.setAngvel({ x: (r() - 0.5) * 40, y: (r() - 0.5) * 30, z: (r() - 0.5) * 40 }, true);

  const frames: number[] = [], impacts: Trajectory['impacts'] = [];
  let prevVy = 0, calm = 0, t = 0, step = 0;
  const push = () => {
    const p = body.translation(), q = body.rotation();
    frames.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
  };
  push();
  while (t < MAX_T) {
    world.step();
    t += DT;
    step++;
    const v = body.linvel(), w = body.angvel();
    if (prevVy < -2 && v.y > prevVy + 2) impacts.push({ frame: Math.ceil(step / SUB), strength: Math.min(1, -prevVy / 14) });
    prevVy = v.y;
    if (step % SUB === 0) push();
    const moving = Math.hypot(v.x, v.y, v.z) + Math.hypot(w.x, w.y, w.z) * 0.5;
    calm = moving < 0.12 ? calm + DT : 0;
    if (calm > 0.12) break;
  }
  push();
  const p = body.translation(), q = body.rotation();
  world.free();
  if (Math.hypot(p.x, p.z) > ARENA + 0.5 || p.y < -0.5) return null; // вылетел
  const top = topFace(model, [q.x, q.y, q.z, q.w]);
  if (top.dot < 0.95 || calm <= 0.12) return null; // на ребре или не успокоился
  return { id: req.id, kind: req.kind, fps: FPS, frames: new Float32Array(frames), impacts, top: top.face };
}

self.onmessage = async (e: MessageEvent<ThrowRequest>) => {
  ready ??= RAPIER.init();
  await ready;
  let traj: Trajectory | null = null;
  for (let attempt = 0; attempt < 12 && !traj; attempt++) traj = simulate(e.data, attempt);
  if (traj) (self as unknown as Worker).postMessage(traj, [traj.frames.buffer]);
  else (self as unknown as Worker).postMessage({ id: e.data.id, error: 'no_throw' });
};
