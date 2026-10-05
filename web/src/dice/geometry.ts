// Геометрия кубиков d10 и d20 без three.js: её же использует поток физики.
// d20 — икосаэдр, противоположные грани в сумме дают 21. d10 — пятиугольный трапецоэдр (10 «воздушных змеев»),
// противоположные грани в сумме дают 11, грани 1–10 (сервер даёт 1–10).

export type V3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w
export type DieKind = 'd10' | 'd20';

export interface DieModel {
  kind: DieKind;
  vertices: V3[];
  /** Индексы вершин грани против часовой стрелки, если смотреть снаружи. */
  faces: number[][];
  normals: V3[];
  centers: V3[];
  /** Число на грани. */
  labels: number[];
  /** Опорная вершина грани: задаёт «верх» числа и рамку грани для поиска симметрий. */
  ref: number[];
}

// ---- векторы и кватернионы ----
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));

export function qmul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}
export function qrot(q: Quat, v: V3): V3 {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
/** Кватернион из матрицы поворота (столбцы c0, c1, c2). */
export function qFromBasis(c0: V3, c1: V3, c2: V3): Quat {
  const m00 = c0[0], m10 = c0[1], m20 = c0[2], m01 = c1[0], m11 = c1[1], m21 = c1[2], m02 = c2[0], m12 = c2[1], m22 = c2[2];
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
  }
  const l = Math.hypot(x, y, z, w);
  return [x / l, y / l, z / l, w / l];
}

function finish(kind: DieKind, vertices: V3[], raw: number[][], ref: (face: number[]) => number): DieModel {
  const faces = raw.map((f) => {
    const c = scale(f.map((i) => vertices[i]!).reduce(add, [0, 0, 0] as V3), 1 / f.length);
    const n = cross(sub(vertices[f[1]!]!, vertices[f[0]!]!), sub(vertices[f[2]!]!, vertices[f[0]!]!));
    return dot(n, c) < 0 ? f.slice().reverse() : f;
  });
  const centers = faces.map((f) => scale(f.map((i) => vertices[i]!).reduce(add, [0, 0, 0] as V3), 1 / f.length));
  const normals = faces.map((f) => norm(cross(sub(vertices[f[1]!]!, vertices[f[0]!]!), sub(vertices[f[2]!]!, vertices[f[0]!]!))));
  // Номера: проходим грани по порядку, свободной даём следующее число, противоположной — дополнение.
  const n = faces.length, sum = n + 1, labels = new Array<number>(n).fill(0);
  const order = faces.map((_, i) => i).sort((a, b) => Math.atan2(centers[a]![2], centers[a]![0]) - Math.atan2(centers[b]![2], centers[b]![0]) || centers[b]![1] - centers[a]![1]);
  let next = 1;
  for (const i of order) {
    if (labels[i] || next > n / 2) continue;
    let opp = 0, best = 2;
    normals.forEach((m, j) => {
      const d = dot(m, normals[i]!);
      if (d < best) { best = d; opp = j; }
    });
    labels[i] = next;
    labels[opp] = sum - next;
    next++;
  }
  return { kind, vertices, faces, normals, centers, labels, ref: faces.map(ref) };
}

function d20(): DieModel {
  const p = (1 + Math.sqrt(5)) / 2;
  const raw: V3[] = [[-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0], [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p], [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]];
  const vertices = raw.map((v) => norm(v));
  const edge = Math.min(...vertices.slice(1).map((v) => len(sub(v, vertices[0]!))));
  const faces: number[][] = [];
  for (let i = 0; i < 12; i++)
    for (let j = i + 1; j < 12; j++)
      for (let k = j + 1; k < 12; k++) {
        const e = (a: number, b: number) => Math.abs(len(sub(vertices[a]!, vertices[b]!)) - edge) < 1e-6;
        if (e(i, j) && e(j, k) && e(i, k)) faces.push([i, j, k]);
      }
  return finish('d20', vertices, faces, (f) => f[0]!);
}

function d10(): DieModel {
  const c = Math.cos(Math.PI / 5), e = 0.105, h = (e * (1 + c)) / (1 - c);
  const vertices: V3[] = [[0, h, 0], [0, -h, 0]];
  for (let i = 0; i < 5; i++) vertices.push([Math.cos((2 * Math.PI * i) / 5), e, Math.sin((2 * Math.PI * i) / 5)]);
  for (let i = 0; i < 5; i++) vertices.push([Math.cos((2 * Math.PI * i) / 5 + Math.PI / 5), -e, Math.sin((2 * Math.PI * i) / 5 + Math.PI / 5)]);
  const u = (i: number) => 2 + (i % 5), d = (i: number) => 7 + (i % 5);
  const faces: number[][] = [];
  for (let i = 0; i < 5; i++) {
    faces.push([0, u(i), d(i), u(i + 1)]);
    faces.push([1, d(i), u(i + 1), d(i + 1)]);
  }
  return finish('d10', vertices, faces, (f) => (f.includes(0) ? 0 : 1));
}

export const MODELS: Record<DieKind, DieModel> = { d10: d10(), d20: d20() };

/** Какая грань смотрит вверх при повороте q (мировая ось Y). */
export function topFace(model: DieModel, q: Quat): { face: number; dot: number } {
  let face = 0, best = -2;
  model.normals.forEach((n, i) => {
    const d = qrot(q, n)[1];
    if (d > best) { best = d; face = i; }
  });
  return { face, dot: best };
}
