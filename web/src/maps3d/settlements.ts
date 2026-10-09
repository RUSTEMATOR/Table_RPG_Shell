import type { PlaceKind } from '@zg/shared';
import type { Instance, ModelId, Team } from './models.ts';
import { hash, rng } from './rng.ts';
import type { Heights } from './terrain.ts';

// Поселения 3D-карты: каждое место собирается из моделей KayKit по своему виду, раскладка — от id места (у всех одна
// и та же). Столица — замок в кольце стен с воротами на юг и слобода вокруг; город — донжон, рынок, таверна, дома;
// деревня — пара домов, мельница или колодец, поле. Цвет крыш и флагов — фракция по цвету надписи места (ink).

export type PlaceLike = { id: string; kind: PlaceKind; x: number; y: number; ink: string | null };

/** Фракция по цвету: ближайший из четырёх цветов набора. */
export function teamOf(ink: string | null, kind: PlaceKind): Team {
  if (kind === 'elven') return 'green';
  if (kind === 'vampire') return 'red';
  if (kind === 'cult') return 'yellow';
  const m = /^#?([0-9a-f]{6})$/i.exec(ink ?? '');
  if (!m) return 'blue';
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  if (max - min < 0.08) return 'blue';
  let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  if (h < 30 || h >= 300) return 'red';
  if (h < 75) return 'yellow';
  if (h < 170) return 'green';
  return 'blue';
}

/** Высота подписи над местом (единицы карты) — над крышами. */
export function liftOf(kind: PlaceKind): number {
  switch (kind) {
    case 'capital':
      return 56;
    case 'bigtown':
      return 46;
    case 'city':
    case 'college':
      return 32;
    case 'town':
    case 'church':
    case 'elven':
      return 24;
    case 'village':
    case 'camp':
      return 14;
    case 'storm':
      return 50;
    default:
      return 16;
  }
}

/** Радиус поселения: там не растут деревья. */
export function radiusOf(kind: PlaceKind): number {
  return kind === 'capital' ? 70 : kind === 'bigtown' ? 56 : kind === 'city' || kind === 'college' ? 40 : kind === 'town' ? 32 : kind === 'village' || kind === 'camp' ? 22 : 18;
}

const K = 12; // единиц карты на единицу модели

export function settlementOf(p: PlaceLike, H: Heights): Instance[] {
  const r = rng(hash(p.id));
  const team = teamOf(p.ink, p.kind);
  const out: Instance[] = [];
  const taken: { x: number; y: number; r: number }[] = [];
  const free = (x: number, y: number, rad: number) => taken.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= (t.r + rad) ** 2);
  const base = (x: number, y: number, rad: number) => Math.min(H.at(x - rad, y - rad), H.at(x + rad, y - rad), H.at(x - rad, y + rad), H.at(x + rad, y + rad), H.at(x, y)) - 0.4;
  const add = (model: ModelId, x: number, y: number, scale: number, rot: number, rad: number, t: Team | undefined = team) => {
    out.push({ model, x, y, base: base(x, y, rad * 0.5), rot, scale, team: t });
    taken.push({ x, y, r: rad });
  };
  const turn = () => Math.floor(r() * 6) * (Math.PI / 3) + (r() - 0.5) * 0.3;
  /** Постройка где-нибудь в кольце rMin…rMax вокруг места. */
  const around = (model: ModelId, rMin: number, rMax: number, scale = K, rad = 6) => {
    for (let tries = 0; tries < 24; tries++) {
      const a = r() * Math.PI * 2;
      const d = rMin + r() * (rMax - rMin);
      const x = p.x + Math.cos(a) * d,
        y = p.y + Math.sin(a) * d;
      if (!free(x, y, rad)) continue;
      add(model, x, y, scale, turn(), rad);
      return;
    }
  };
  const houses = (n: number, rMin: number, rMax: number) => {
    for (let i = 0; i < n; i++) around(r() < 0.55 ? 'home_a' : 'home_b', rMin, rMax, K * (0.95 + r() * 0.15), 6);
  };
  /** Кольцо стен с воротами на юг и башнями на стыках. */
  const walls = (R: number, n: number) => {
    const seg = (2 * Math.PI * R) / n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 2; // первое звено — на юге (ворота)
      const x = p.x + Math.cos(a) * R,
        y = p.y + Math.sin(a) * R;
      out.push({ model: i === 0 ? 'wall_gate' : 'wall', x, y, base: base(x, y, 4), rot: -(a + Math.PI / 2), scale: seg / 2 });
      const ta = a + Math.PI / n;
      if (i % 2 === 1) {
        const tx = p.x + Math.cos(ta) * R,
          ty = p.y + Math.sin(ta) * R;
        out.push({ model: 'tower_b', x: tx, y: ty, base: base(tx, ty, 3), rot: r() * 6.28, scale: K * 0.7, team });
      }
    }
    taken.push({ x: p.x, y: p.y, r: R + 6 });
  };
  const flag = (x: number, y: number) => out.push({ model: 'flag', x, y, base: H.at(x, y) - 0.2, rot: r() * 6.28, scale: 34, team });

  switch (p.kind) {
    case 'capital':
      add('castle', p.x, p.y, K * 1.08, Math.PI, 0);
      walls(25, 8);
      flag(p.x - 9, p.y + 31);
      flag(p.x + 9, p.y + 31);
      around('market', 34, 44, K, 11);
      around('tavern', 34, 50, K, 9);
      around('church', 36, 52, K, 8);
      around('blacksmith', 36, 54, K, 8);
      houses(10, 34, 62);
      around('windmill', 58, 72, K, 8);
      around('well', 34, 50, K, 4);
      break;
    case 'bigtown':
      add('castle', p.x, p.y, K * 0.85, Math.PI, 0);
      walls(20, 7);
      flag(p.x, p.y + 25);
      around('market', 27, 36, K, 11);
      around('church', 28, 40, K, 8);
      around('tavern', 28, 42, K, 9);
      houses(7, 27, 50);
      around('windmill', 44, 56, K, 8);
      break;
    case 'city':
      add('tower_a', p.x, p.y, K, turn(), 8);
      around('market', 12, 20, K, 11);
      around('tavern', 12, 24, K, 9);
      around('blacksmith', 14, 26, K, 8);
      houses(6, 12, 32);
      around('well', 10, 22, K, 4);
      flag(p.x + 6, p.y + 8);
      break;
    case 'town':
      add('church', p.x, p.y, K, turn(), 8);
      around('tavern', 11, 20, K, 9);
      houses(4, 10, 24);
      around('well', 9, 18, K, 4);
      around('windmill', 20, 30, K, 8);
      break;
    case 'village':
      houses(2 + Math.floor(r() * 2), 3, 12);
      if (r() < 0.5) around('windmill', 10, 18, K * 0.9, 7);
      else around('well', 4, 12, K, 4);
      around('grain', 14, 22, K * 0.75, 9);
      break;
    case 'elven':
      add('tower_b', p.x, p.y, K * 1.1, turn(), 7);
      for (let i = 0; i < 2; i++) around('home_b', 10, 20, K * 0.9, 6);
      for (let i = 0; i < 5; i++) around(r() < 0.5 ? 'trees_a_m' : 'trees_b_m', 16, 30, 10, 8);
      flag(p.x + 6, p.y + 7);
      break;
    case 'college':
      add('tower_a', p.x, p.y, K * 1.15, turn(), 7);
      around('tower_b', 12, 18, K * 0.9, 6);
      around('church', 14, 24, K, 8);
      houses(2, 14, 26);
      flag(p.x - 6, p.y + 9);
      flag(p.x + 6, p.y + 9);
      break;
    case 'camp':
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + r() * 0.5;
        add('tent', p.x + Math.cos(a) * 9, p.y + Math.sin(a) * 9, 17, -a + Math.PI / 2, 5);
      }
      flag(p.x, p.y);
      around('weaponrack', 12, 16, 16, 3);
      around('barrel', 10, 16, 16, 2);
      around('crate', 10, 16, 14, 2);
      break;
    case 'church':
      add('church', p.x, p.y, K, turn(), 8);
      around('well', 9, 14, K, 4);
      houses(1, 12, 18);
      // погост у храма (этап 58, KayKit Halloween Bits)
      for (let i = 0; i < 4; i++) around(r() < 0.5 ? 'gravestone' : 'gravemarker', 10, 16, K, 1.5);
      break;
    case 'crypt':
      // склеп среди могил и мёртвых деревьев (этап 58)
      add('crypt_h', p.x, p.y, K, turn(), 9);
      for (let i = 0; i < 6; i++) around(r() < 0.4 ? 'grave_a' : r() < 0.7 ? 'grave_b' : 'gravestone', 10, 18, K, 2.5);
      for (let i = 0; i < 3; i++) around(r() < 0.5 ? 'tree_dead_l' : 'tree_dead_m', 14, 22, K, 4);
      around('post_lantern', 8, 11, K, 2);
      around('fence_iron', 16, 20, K, 4);
      break;
    case 'cult': {
      add('stage', p.x, p.y, K * 0.8, turn(), 6);
      add('shrine', p.x, p.y, K * 1.6, turn(), 3);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        out.push({ model: 'rock_c', x: p.x + Math.cos(a) * 13, y: p.y + Math.sin(a) * 13, base: H.at(p.x, p.y) - 0.2, rot: a, scale: 22 });
      }
      flag(p.x + 4, p.y - 4);
      around('tent', 18, 24, 16, 5);
      for (let i = 0; i < 3; i++) around('lantern', 10, 16, K * 1.4, 1.5);
      around('tree_dead_m', 18, 26, K, 4);
      break;
    }
    case 'vampire':
      add('ruin', p.x, p.y, K * 0.9, turn(), 7);
      around('tent', 9, 15, 16, 5);
      around('tent', 9, 15, 16, 5);
      flag(p.x + 5, p.y + 5);
      around('barrel', 8, 14, 16, 2);
      // гробы, фонари и мёртвые деревья (этап 58)
      for (let i = 0; i < 2; i++) around('coffin', 6, 12, K, 2.5);
      for (let i = 0; i < 2; i++) around('post_lantern', 9, 14, K, 2);
      for (let i = 0; i < 2; i++) around(r() < 0.5 ? 'tree_dead_l' : 'tree_dead_m', 14, 22, K, 4);
      break;
    case 'lake':
      for (let i = 0; i < 4; i++) out.push({ model: 'lily', x: p.x + (r() - 0.5) * 30, y: p.y + (r() - 0.5) * 20, base: -1.1, rot: r() * 6.28, scale: 22 });
      break;
    case 'storm':
    case 'mark':
      break;
  }
  return out;
}
