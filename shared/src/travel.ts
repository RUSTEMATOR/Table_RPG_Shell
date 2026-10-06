import type { MapId } from './constants.ts';

// Путь и время в дороге (этап 28): кратчайший путь по открытым дорогам (Дейкстра), без дороги — напрямик, но дольше.
// Одна функция для сервера (поход отряда) и клиента (подсказки «≈ 3 дня», предпросмотр пути). Работает только с тем,
// что уже открыто: дороги — те, что видит игрок (оба конца открыты), места — открытые.

export type Pt = [number, number];

/** Вёрст (км) в единице карты и скорость в день. Масштаб — на глаз по рисункам: Раздолье ~1000 км в ширину. */
export const MAP_KM_PER_UNIT: Record<MapId, number> = { world: 3.2, razdolye: 0.6, frozen: 0.8 };
export const KM_PER_DAY = { foot: 30, horse: 50 } as const;
/** Напрямик (без дороги) — во столько раз дольше. */
export const OFFROAD = 1.6;

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

/** Точки пути из SVG d дорог карт (M, L, C, Q — абсолютные, как их пишет tools/extract-maps). */
export function roadPoints(d: string, steps = 6): Pt[] {
  const out: Pt[] = [];
  let x = 0,
    y = 0;
  for (const seg of d.match(/[MLCQ][^MLCQ]*/g) ?? []) {
    const c = seg[0];
    const n = (seg.slice(1).match(NUM) ?? []).map(Number);
    if (c === 'M' || c === 'L') {
      for (let i = 0; i + 1 < n.length; i += 2) {
        x = n[i]!;
        y = n[i + 1]!;
        out.push([x, y]);
      }
    } else if (c === 'C') {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const [x1, y1, x2, y2, ex, ey] = n.slice(i, i + 6) as [number, number, number, number, number, number];
        for (let k = 1; k <= steps; k++) {
          const t = k / steps,
            u = 1 - t;
          out.push([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey]);
        }
        x = ex;
        y = ey;
      }
    } else if (c === 'Q') {
      for (let i = 0; i + 3 < n.length; i += 4) {
        const [x1, y1, ex, ey] = n.slice(i, i + 4) as [number, number, number, number];
        for (let k = 1; k <= steps; k++) {
          const t = k / steps,
            u = 1 - t;
          out.push([u * u * x + 2 * u * t * x1 + t * t * ex, u * u * y + 2 * u * t * y1 + t * t * ey]);
        }
        x = ex;
        y = ey;
      }
    }
  }
  return out;
}

export function polyLength(p: Pt[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]);
  return s;
}

export type TravelRoad = { a: string; b: string; d: string };
export type TravelPlace = { id: string; x: number; y: number };
export type Route = { path: Pt[]; units: number; km: number; days: { foot: number; horse: number }; offroad: boolean };

const NEAR = 14; // ближе — значит «в этом месте»

type Edge = { to: string; w: number; pts: Pt[] };

/** Граф дорог: узлы — места, ребро — дорога (точки в обе стороны). */
function graph(roads: TravelRoad[], places: Map<string, TravelPlace>) {
  const g = new Map<string, Edge[]>();
  const add = (from: string, e: Edge) => (g.get(from) ?? g.set(from, []).get(from)!).push(e);
  for (const r of roads) {
    if (!places.has(r.a) || !places.has(r.b)) continue;
    const pts = roadPoints(r.d);
    if (pts.length < 2) continue;
    const w = polyLength(pts);
    add(r.a, { to: r.b, w, pts });
    add(r.b, { to: r.a, w, pts: [...pts].reverse() });
  }
  return g;
}

/**
 * Расстояния от точки (обычно — отряда) до всех мест: по дорогам, а до дороги и от неё — напрямик с OFFROAD.
 * Возвращает функцию «путь до места».
 */
export function routesFrom(mapId: MapId, from: { x: number; y: number }, roads: TravelRoad[], placeList: TravelPlace[]): (placeId: string) => Route | null {
  const places = new Map(placeList.map((p) => [p.id, p]));
  const g = graph(roads, places);
  const START = '\u0000start';
  const dist = new Map<string, number>([[START, 0]]);
  const prev = new Map<string, { from: string; pts: Pt[]; off: boolean }>();
  // старт: в месте — по дорогам сразу; вне — напрямик к ближайшим местам на дорогах
  const atPlace = placeList.find((p) => Math.hypot(p.x - from.x, p.y - from.y) < NEAR);
  const startEdges: Edge[] = atPlace
    ? [{ to: atPlace.id, w: 0, pts: [[atPlace.x, atPlace.y]] }]
    : [...g.keys()]
        .map((id) => places.get(id)!)
        .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))
        .slice(0, 3)
        .map((p) => ({ to: p.id, w: Math.hypot(p.x - from.x, p.y - from.y) * OFFROAD, pts: [[p.x, p.y] as Pt] }));
  const todo = new Set<string>([START]);
  const edgesOf = (id: string) => (id === START ? startEdges : (g.get(id) ?? []));
  while (todo.size) {
    let cur = '';
    let best = Infinity;
    for (const id of todo) {
      const d = dist.get(id)!;
      if (d < best) {
        best = d;
        cur = id;
      }
    }
    todo.delete(cur);
    for (const e of edgesOf(cur)) {
      const nd = best + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { from: cur, pts: e.pts, off: cur === START && !atPlace });
        todo.add(e.to);
      }
    }
  }
  const km = MAP_KM_PER_UNIT[mapId];
  const make = (units: number, path: Pt[], offroad: boolean): Route => {
    const k = units * km;
    return { path, units, km: k, days: { foot: k / KM_PER_DAY.foot, horse: k / KM_PER_DAY.horse }, offroad };
  };
  return (placeId) => {
    const to = places.get(placeId);
    if (!to) return null;
    if (Math.hypot(to.x - from.x, to.y - from.y) < NEAR) return make(0, [[from.x, from.y]], false);
    const straight = Math.hypot(to.x - from.x, to.y - from.y) * OFFROAD;
    const viaRoad = dist.get(placeId);
    if (viaRoad === undefined || straight <= viaRoad)
      return make(
        straight,
        [
          [from.x, from.y],
          [to.x, to.y],
        ],
        true,
      );
    // путь назад по цепочке
    const parts: Pt[][] = [];
    let offroad = false;
    let id = placeId;
    while (id !== START) {
      const p = prev.get(id)!;
      parts.unshift(p.pts);
      offroad ||= p.off;
      id = p.from;
    }
    const path: Pt[] = [[from.x, from.y]];
    for (const seg of parts) for (const q of seg) if (Math.hypot(q[0] - path[path.length - 1]![0], q[1] - path[path.length - 1]![1]) > 0.01) path.push(q);
    return make(viaRoad, path, offroad);
  };
}

/** «≈ 3 дня» / «меньше дня» / «на месте». */
export function daysText(days: number): string {
  if (days <= 0.01) return 'на месте';
  if (days < 0.75) return 'меньше дня';
  const n = Math.max(1, Math.round(days));
  const word = n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дня' : 'дней';
  return `≈ ${n} ${word}`;
}
