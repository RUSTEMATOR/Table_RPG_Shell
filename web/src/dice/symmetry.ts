import { cross, dot, len, norm, qFromBasis, qrot, sub, type DieModel, type Quat, type V3 } from './geometry.ts';

// Симметрии тела кубика. Посадка на число сервера: физика честно бросает кубик, вверху оказывается грань f;
// сервер прислал значение v на грани k. Поворот R из группы симметрий тела переводит грань k в грань f и
// вершины — в вершины. Рисуем q(τ)·R: в каждом кадре кубик занимает ровно тот же объём, а вверху грань k.

function frame(model: DieModel, face: number, refVertex: number): [V3, V3, V3] {
  const n = model.normals[face]!;
  const toRef = sub(model.vertices[refVertex]!, model.centers[face]!);
  const t = norm(sub(toRef, [n[0] * dot(toRef, n), n[1] * dot(toRef, n), n[2] * dot(toRef, n)]));
  return [t, cross(n, t), n];
}

function apply(m: [V3, V3, V3], inv: [V3, V3, V3], v: V3): V3 {
  // v → базис inv (транспонированная матрица), затем → базис m
  const a = dot(v, inv[0]), b = dot(v, inv[1]), c = dot(v, inv[2]);
  return [m[0][0] * a + m[1][0] * b + m[2][0] * c, m[0][1] * a + m[1][1] * b + m[2][1] * c, m[0][2] * a + m[1][2] * b + m[2][2] * c];
}

const cache = new Map<string, Quat>();

/** Поворот тела, переводящий грань from в грань to и множество вершин в себя. */
export function alignFace(model: DieModel, from: number, to: number): Quat {
  const key = `${model.kind}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = frame(model, from, model.ref[from]!);
  const candidates = model.kind === 'd10' ? [model.ref[to]!] : model.faces[to]!;
  for (const r of candidates) {
    const dst = frame(model, to, r);
    const ok = model.vertices.every((v) => {
      const w = apply(dst, src, v);
      return model.vertices.some((u) => len(sub(u, w)) < 1e-4);
    });
    if (!ok) continue;
    const ex = apply(dst, src, [1, 0, 0]), ey = apply(dst, src, [0, 1, 0]), ez = apply(dst, src, [0, 0, 1]);
    const q = qFromBasis(ex, ey, ez);
    cache.set(key, q);
    return q;
  }
  throw new Error(`Нет симметрии ${model.kind}: грань ${from} → ${to}`);
}

/** Поворот, с которым кубик ляжет значением value вверх, если физика положила вверх грань top. */
export function landingRotation(model: DieModel, top: number, value: number): Quat {
  const k = model.labels.indexOf(value);
  if (k < 0) throw new Error(`Нет грани ${value} на ${model.kind}`);
  return alignFace(model, k, top);
}

export { qrot };
