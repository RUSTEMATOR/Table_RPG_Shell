import { MAP_H, MAP_W } from '@zg/shared';
import type { Art } from '../maps/MapArt.tsx';
import type { Instance, ModelId } from './models.ts';
import { along, flatten } from './path.ts';
import { hash, rng } from './rng.ts';
import { reliefOf, type Heights } from './terrain.ts';

// Природа 3D-карты из рисунка пергамента: деревья — на месте нарисованных, леса — заполняются группами деревьев,
// горы, холмы и вулканы — моделями KayKit на подъёмах рельефа, стена Заставы — звеньями стены с башнями.
// Облака-ориентиры (буря, мгла Бладмиста, сумерки) — отдельным списком: им нужен свой материал.
// keep — места поселений, где деревья не растут.

export type Keep = { x: number; y: number; r: number }[];

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;

function blocked(keep: Keep, x: number, y: number): boolean {
  for (const k of keep) if ((x - k.x) ** 2 + (y - k.y) ** 2 < k.r * k.r) return true;
  return false;
}

const natureCache = new Map<string, Instance[]>();

/** Деревья, горы, холмы, стены. Раз на карту и раскладку мест (keep): правка имён и видимости её не трогает. */
export function natureOf(art: Art, H: Heights, keep: Keep): Instance[] {
  const key = `${art.id}|${keep.map((k) => `${Math.round(k.x)},${Math.round(k.y)},${Math.round(k.r)}`).join(';')}`;
  const hit = natureCache.get(key);
  if (hit) return hit;
  const list = computeNature(art, H, keep);
  if (natureCache.size > 6) natureCache.clear();
  natureCache.set(key, list);
  return list;
}

function computeNature(art: Art, H: Heights, keep: Keep): Instance[] {
  const out: Instance[] = [];
  const r = rng(hash(art.id + ':nature'));
  const put = (model: ModelId, x: number, y: number, scale: number, sink = 0.3, rot = r() * Math.PI * 2) => {
    out.push({ model, x, y, base: H.at(x, y) - sink, rot, scale });
  };

  // отдельные деревья рисунка
  const trees = art.id === 'world' ? art.art.trees : art.id === 'razdolye' ? [...art.art.trees, ...art.art.nTrees] : [];
  for (const t of trees) {
    if (blocked(keep, t.x, t.y)) continue;
    put(r() < 0.55 ? 'tree_a' : 'tree_b', t.x, t.y, t.r * 2.3);
  }
  // ели Замёрзших земель: путь «M x,y l… h… z» — вершина, основание на 11.8 ниже
  if (art.id === 'frozen')
    for (const p of art.art.pines) {
      const m = /M\s*(-?[\d.]+),(-?[\d.]+)/.exec(p.d);
      if (!m) continue;
      const x = Number(m[1]),
        y = Number(m[2]) + 11.8;
      if (!blocked(keep, x, y)) put('tree_b', x, y, 9 + r() * 2);
    }
  // леса — группы деревьев по сетке со сдвигом
  const woods = art.id === 'frozen' ? [] : art.art.woods;
  if (woods.length) {
    const ctx = document.createElement('canvas').getContext('2d')!;
    for (const w of woods) {
      const path = new Path2D(w.d);
      const pts = flatten(w.d, 4).flat();
      const xs = pts.map((p) => p[0]),
        ys = pts.map((p) => p[1]);
      const step = 19;
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
        for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
          const jx = x + (r() - 0.5) * step * 0.8,
            jy = y + (r() - 0.5) * step * 0.8;
          if (!ctx.isPointInPath(path, jx, jy) || blocked(keep, jx, jy)) continue;
          put(pick(r, ['trees_a_m', 'trees_b_m', 'trees_a_l', 'trees_b_l', 'trees_a_s'] as const), jx, jy, 10 + r() * 2.5);
        }
      }
    }
  }
  // горы
  const { mounts, hills, volcs } = reliefOf(art);
  for (const m of mounts) {
    const snowy = m.snow || art.id === 'frozen';
    const model: ModelId = snowy
      ? pick(r, ['mountain_a', 'mountain_b', 'mountain_c'] as const)
      : pick(r, ['mountain_a_grass', 'mountain_b_grass', 'mountain_c_grass', 'mountain_a'] as const);
    put(model, m.x, m.y, 12.5 * m.s * (0.9 + r() * 0.25), 3);
    if (r() < 0.45) put(pick(r, ['rock_a', 'rock_b', 'rock_c', 'rock_d'] as const), m.x + (r() - 0.5) * 30 * m.s, m.y + 8 + r() * 10, 12);
  }
  for (const v of volcs) put('mountain_c', v.x, v.y, 15 * v.s, 3);
  for (const h of hills) {
    if (blocked(keep, h.x, h.y)) continue;
    put(pick(r, ['hills_a', 'hills_c', 'hill_a', 'hill_b', 'hills_b'] as const), h.x, h.y, 9 * Math.max(0.8, h.s), 2.6);
  }
  // стена Заставы: звенья вдоль пути, башня через каждые пять
  if (art.id === 'frozen') {
    const SEG = 24;
    for (const line of flatten(art.art.wall, 10)) {
      along(line, SEG).forEach((p, i) => {
        out.push({ model: i % 6 === 3 ? 'wall_gate' : 'wall', x: p.x, y: p.y, base: H.at(p.x, p.y) - 0.5, rot: -p.a, scale: SEG / 2 });
        if (i % 5 === 0) out.push({ model: 'tower_b', x: p.x, y: p.y, base: H.at(p.x, p.y) - 0.5, rot: r() * 6.28, scale: 10, team: 'red' });
      });
    }
  }
  return out;
}

const landmarkCache = new Map<string, Instance[]>();

/** Облака-ориентиры: буря, мгла, сумерки, дым вулканов. Свой цвет у каждого. Раз на карту. */
export function landmarkClouds(art: Art, H: Heights): Instance[] {
  const hit = landmarkCache.get(art.id);
  if (hit) return hit;
  const out: Instance[] = [];
  landmarkCache.set(art.id, out);
  const r = rng(hash(art.id + ':clouds'));
  const cloud = (x: number, y: number, lift: number, scale: number, color: string, big = r() < 0.5) =>
    out.push({ model: big ? 'cloud_big' : 'cloud_small', x, y, base: Math.max(H.at(x, y), 0) + lift, rot: r() * 6.28, scale, color });
  if (art.id === 'world') {
    for (const [x, y] of [
      [250, 600],
      [330, 800],
      [240, 950],
      [400, 690],
    ] as const)
      for (let i = 0; i < 3; i++) cloud(x + (r() - 0.5) * 160, y + (r() - 0.5) * 50, 14 + r() * 10, 7 + r() * 4, '#9a5a6c');
    for (const [x, y] of [
      [1260, 460],
      [1360, 370],
      [1180, 580],
    ] as const)
      for (let i = 0; i < 3; i++) cloud(x + (r() - 0.5) * 220, y + (r() - 0.5) * 70, 18 + r() * 12, 8 + r() * 4, '#f4f7fa');
    for (const v of art.art.volcs) cloud(v.x, v.y - 4, 26 * v.s, 5, '#5c5550', false);
  } else if (art.id === 'razdolye') {
    const t = art.art.twilight;
    for (let i = 0; i < 6; i++) cloud(t.x + (r() - 0.5) * 220, t.y + (r() - 0.5) * 100, 8 + r() * 8, 6 + r() * 3, '#6a5690');
  } else {
    for (const line of flatten(art.art.storm, 8))
      for (const p of along(line, 34)) cloud(p.x + (r() - 0.5) * 10, p.y + (r() - 0.5) * 10, 22 + r() * 16, 7 + r() * 4, r() < 0.5 ? '#7c3a86' : '#5a2a66');
    const e = art.art.eye;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      cloud(e.x + Math.cos(a) * 55, e.y + Math.sin(a) * 55, 30 + r() * 10, 8, '#8a3a90');
    }
  }
  return out;
}

/** Облака тумана — по всей карте; шейдер оставляет их только там, где туман. */
export function fogClouds(H: Heights): Instance[] {
  const out: Instance[] = [];
  const r = rng(7331);
  const step = 92;
  for (let y = step / 2; y < MAP_H; y += step)
    for (let x = step / 2; x < MAP_W; x += step) {
      const cx = x + (r() - 0.5) * step * 0.7,
        cy = y + (r() - 0.5) * step * 0.7;
      out.push({ model: r() < 0.6 ? 'cloud_big' : 'cloud_small', x: cx, y: cy, base: Math.max(4, H.at(cx, cy) * 0.15) + 6 + r() * 10, rot: r() * 6.28, scale: 11 + r() * 6 });
    }
  return out;
}
