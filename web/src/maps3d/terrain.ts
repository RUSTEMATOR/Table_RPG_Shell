import { MAP_H, MAP_W } from '@zg/shared';
import type { Art } from '../maps/MapArt.tsx';
import type { ViewRegion } from '../maps/MapView.tsx';
import { hash, noise2 } from './rng.ts';

// Рельеф 3D-карты из того же рисунка, что и пергамент (web/src/maps/art): высоты — сетка над 1600×1100 (горы и холмы —
// подъёмы, реки и озеро — русла), цвет — текстура, нарисованная Canvas 2D по SVG-путям рисунка (Path2D понимает их сам):
// земли, леса, поля, реки, дороги, границы. Тон регионов — только у тех, что пришли с сервера (открытые; мастеру — все).
// Туман — отдельная маска открытых регионов (см. fog в scene.ts).

export type Heights = { gw: number; gh: number; step: number; data: Float32Array; at: (x: number, y: number) => number };

/** Шаг сетки высот в единицах карты. */
const STEP = 5;
/** Уровень воды: русла рек и озеро опускаются ниже него. */
export const WATER = -1.2;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const ringsPath = (shape: number[][][]) => shape.map((r) => 'M' + r.map((q) => `${q[0]},${q[1]}`).join('L') + 'Z').join('');

/** Точки гор, холмов и вулканов рисунка (для высот и моделей). */
export function reliefOf(art: Art) {
  const mounts: { x: number; y: number; s: number; snow: boolean; outer: boolean }[] = [];
  const hills: { x: number; y: number; s: number }[] = [];
  const volcs: { x: number; y: number; s: number }[] = [];
  const hillOf = (d: string) => {
    const m = /M\s*(-?[\d.]+),(-?[\d.]+)\s*q\s*(-?[\d.]+),(-?[\d.]+)\s+(-?[\d.]+),/.exec(d);
    return m ? { x: Number(m[1]) + Number(m[5]) / 2, y: Number(m[2]), s: Math.abs(Number(m[5])) / 20 } : null;
  };
  if (art.id === 'world') {
    for (const m of art.art.mounts) mounts.push({ x: m.x, y: m.y, s: m.s, snow: !!m.snow, outer: false });
    for (const h of art.art.hills) {
      const p = hillOf(h.d);
      if (p) hills.push(p);
    }
    volcs.push(...art.art.volcs);
  } else if (art.id === 'razdolye') {
    for (const m of art.art.mounts) mounts.push({ x: m.x, y: m.y, s: m.s, snow: !!m.snow, outer: false });
    for (const m of art.art.nMounts) mounts.push({ x: m.x, y: m.y, s: m.s, snow: true, outer: true });
    for (const d of art.art.hills) {
      const p = hillOf(d);
      if (p) hills.push(p);
    }
  } else {
    for (const m of art.art.mounts) mounts.push({ x: m.x, y: m.y, s: m.s, snow: true, outer: false });
  }
  return { mounts, hills, volcs };
}

function riversOf(art: Art): { d: string; w: number }[] {
  return art.id === 'frozen' ? [] : art.art.rivers.map((r) => ({ d: r.d, w: r.w }));
}

/** Размытие канала яркости (по месту), коробкой радиуса r, проходов n. */
function blur(src: Float32Array<ArrayBuffer>, w: number, h: number, r: number, n: number): Float32Array<ArrayBuffer> {
  let a = src,
    b = new Float32Array(a.length);
  for (let pass = 0; pass < n; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0,
          c = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k;
          if (xx < 0 || xx >= w) continue;
          s += a[y * w + xx]!;
          c++;
        }
        b[y * w + x] = s / c;
      }
    }
    [a, b] = [b, a];
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let s = 0,
          c = 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          if (yy < 0 || yy >= h) continue;
          s += a[yy * w + x]!;
          c++;
        }
        b[y * w + x] = s / c;
      }
    }
    [a, b] = [b, a];
  }
  return a;
}

/** Маска рек и озера (0…1) на сетке высот. */
function waterMask(art: Art, gw: number, gh: number): Float32Array {
  const c = canvas(gw, gh);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(1 / STEP, 1 / STEP);
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of riversOf(art)) {
    ctx.lineWidth = r.w * 2 + 6;
    ctx.stroke(new Path2D(r.d));
  }
  if (art.id === 'frozen') ctx.fill(new Path2D(art.art.lake));
  const img = ctx.getImageData(0, 0, gw, gh).data;
  const m = new Float32Array(gw * gh);
  for (let i = 0; i < m.length; i++) m[i] = img[i * 4]! / 255;
  return blur(m, gw, gh, 1, 2);
}

const heightsCache = new Map<string, Heights>();

/** Высоты рельефа: мягкий шум, горы и холмы, русла рек. Зависит только от рисунка карты — считается раз на карту. */
export function buildHeights(art: Art): Heights {
  const hit = heightsCache.get(art.id);
  if (hit) return hit;
  const h = computeHeights(art);
  heightsCache.set(art.id, h);
  return h;
}

function computeHeights(art: Art): Heights {
  const gw = Math.round(MAP_W / STEP) + 1,
    gh = Math.round(MAP_H / STEP) + 1;
  const data = new Float32Array(gw * gh);
  const seed = hash(art.id);
  const { mounts, hills, volcs } = reliefOf(art);
  const water = waterMask(art, gw, gh);
  const bumps: { x: number; y: number; a: number; s2: number; r: number }[] = [
    ...mounts.map((m) => ({ x: m.x, y: m.y, a: 15 * m.s, s2: (13 * m.s) ** 2, r: 40 * m.s })),
    ...hills.map((h) => ({ x: h.x, y: h.y, a: 5 * h.s, s2: (11 * h.s) ** 2, r: 32 * h.s })),
    ...volcs.map((v) => ({ x: v.x, y: v.y, a: 20 * v.s, s2: (17 * v.s) ** 2, r: 52 * v.s })),
  ];
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = i * STEP,
        y = j * STEP;
      let h = 7 * (noise2(x / 210, y / 210, seed, 3) - 0.5) + 2.5 * (noise2(x / 48, y / 48, seed + 7, 2) - 0.5) + 2;
      for (const b of bumps) {
        const dx = x - b.x,
          dy = y - b.y;
        if (Math.abs(dx) > b.r || Math.abs(dy) > b.r) continue;
        h += b.a * Math.exp(-(dx * dx + dy * dy) / (2 * b.s2));
      }
      const w = water[j * gw + i]!;
      // русло: берег сглаживается к воде, дно — ниже уровня воды
      h = h * (1 - Math.min(1, w * 1.6)) + (WATER - 2.2) * Math.min(1, w * 1.6);
      data[j * gw + i] = h;
    }
  }
  const at = (x: number, y: number) => {
    const fx = Math.min(gw - 1.001, Math.max(0, x / STEP)),
      fy = Math.min(gh - 1.001, Math.max(0, y / STEP));
    const i = Math.floor(fx),
      j = Math.floor(fy);
    const tx = fx - i,
      ty = fy - j;
    const a = data[j * gw + i]!,
      b = data[j * gw + i + 1]!,
      c = data[(j + 1) * gw + i]!,
      d = data[(j + 1) * gw + i + 1]!;
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  return { gw, gh, step: STEP, data, at };
}

// ---- цвет ----

const toneCache = new Map<string, Float32Array>();
/** Пятнистость земли: множитель яркости для каждого пикселя малого холста. */
function toneOf(id: string, sw: number, sh: number): Float32Array {
  const hit = toneCache.get(id);
  if (hit) return hit;
  const t = new Float32Array(sw * sh);
  const seed = hash(id + ':tone');
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) t[y * sw + x] = (noise2(x / 18, y / 18, seed, 3) - 0.5) * 0.22 + (noise2(x / 4, y / 4, seed + 3, 1) - 0.5) * 0.06;
  toneCache.set(id, t);
  return t;
}

const GRASS = '#93b55c';
const SNOW = '#eef3f7';

/** Тон земли по заливке региона (заливки — из исходных данных карты, у всех карт одни и те же). */
function biomeOf(fill: string | null): { color: string; alpha: number } | null {
  switch ((fill ?? '').toLowerCase()) {
    case '':
      return null;
    case '#a7c08a': // Зелёные долины
      return { color: '#7fb04c', alpha: 0.55 };
    case '#9c6b78': // Бладмист
      return { color: '#8a5966', alpha: 0.8 };
    case '#dfe7ef': // Замёрзшие земли
      return { color: SNOW, alpha: 0.95 };
    case '#ddc98d': // Проклятые земли
      return { color: '#c8ad69', alpha: 0.85 };
    case '#a39a8e': // Сгоревшие земли
      return { color: '#7c746b', alpha: 0.9 };
    case '#9fb3cc': // Восточное королевство (и Раздолье на карте мира): лишь оттенок
      return { color: '#5f84b8', alpha: 0.1 };
    case '#d39b7c': // Западное королевство
      return { color: '#b8653f', alpha: 0.1 };
    default:
      return { color: fill!, alpha: 0.3 };
  }
}

/**
 * Текстура рельефа. regions — видимые этому зрителю (мастеру — все, скрытые с visible=false — штриховка).
 * size — ширина в пикселях (высота по пропорции карты).
 */
export function paintTerrain(art: Art, regions: ViewRegion[], roads: { d: string; open?: boolean }[], gm: boolean, size: number): HTMLCanvasElement {
  const k = size / MAP_W;
  const W = size,
    H = Math.round(MAP_H * k);

  // Мягкий слой — в малом холсте, потом растягивается с размытием.
  const sw = 400,
    sh = 275;
  const soft = canvas(sw, sh);
  const s = soft.getContext('2d', { willReadFrequently: true })!;
  s.scale(sw / MAP_W, sh / MAP_H);
  s.fillStyle = art.id === 'frozen' ? SNOW : GRASS;
  s.fillRect(0, 0, MAP_W, MAP_H);
  s.lineCap = 'round';
  s.lineJoin = 'round';

  const fillRegion = (shape: number[][][], fill: string | null) => {
    const b = biomeOf(fill);
    if (!b) return;
    s.globalAlpha = b.alpha;
    s.fillStyle = b.color;
    s.fill(new Path2D(ringsPath(shape)));
  };
  // Земли Замёрзших земель — снег (у самих регионов карты заливки нет).
  if (art.id === 'frozen') {
    s.globalAlpha = 1;
    s.fillStyle = '#93a86a';
    s.fillRect(0, 0, MAP_W, MAP_H);
    s.fillStyle = SNOW;
    s.fill(new Path2D(art.art.land));
  }
  for (const r of regions) {
    fillRegion(r.shape, r.fill);
    for (const x of r.extra) fillRegion(x.shape, x.fill);
  }
  s.globalAlpha = 1;

  // знаки рисунка — пятнами
  const strokes = (list: string[], color: string, width: number, alpha: number) => {
    s.globalAlpha = alpha;
    s.strokeStyle = color;
    s.lineWidth = width;
    for (const d of list) s.stroke(new Path2D(d));
    s.globalAlpha = 1;
  };
  const mists: { x: number; y: number; rx: number; ry: number; c: string; a: number }[] = [];
  if (art.id === 'world') {
    const a = art.art;
    strokes(a.ice, SNOW, 34, 0.7);
    strokes(a.dunes, '#dcc28a', 30, 0.55);
    strokes(a.cracks, '#5f564c', 22, 0.35);
    strokes(a.tufts, '#7a4656', 26, 0.35);
    for (const w of a.woods) {
      s.globalAlpha = 0.7;
      s.fillStyle = '#4f7f3a';
      s.fill(new Path2D(w.d));
    }
    mists.push(
      { x: 250, y: 600, rx: 130, ry: 46, c: '#6a2e40', a: 0.25 },
      { x: 330, y: 800, rx: 150, ry: 50, c: '#6a2e40', a: 0.25 },
      { x: 240, y: 950, rx: 120, ry: 40, c: '#6a2e40', a: 0.25 },
      { x: 790, y: 950, rx: 140, ry: 50, c: '#3b3631', a: 0.3 },
    );
  } else if (art.id === 'razdolye') {
    const a = art.art;
    for (const w of a.woods) {
      s.globalAlpha = 0.75;
      s.fillStyle = '#4f7f3a';
      s.fill(new Path2D(w.d));
    }
    mists.push({ x: a.twilight.x, y: a.twilight.y, rx: 130, ry: 64, c: '#4e3a6a', a: 0.45 });
  } else {
    const a = art.art;
    strokes(a.ice, '#d5e2ee', 26, 0.6);
    strokes(a.dunes, '#d8c28c', 28, 0.5);
    strokes([a.storm], '#a04aa6', 60, 0.28);
    mists.push({ x: a.eye.x, y: a.eye.y, rx: 110, ry: 110, c: '#7a2a80', a: 0.35 });
  }
  for (const m of mists) {
    const g = s.createRadialGradient(m.x, m.y, 0, m.x, m.y, Math.max(m.rx, m.ry));
    g.addColorStop(0, m.c);
    g.addColorStop(1, 'transparent');
    s.globalAlpha = m.a;
    s.fillStyle = g;
    s.save();
    s.translate(m.x, m.y);
    s.scale(1, m.ry / m.rx);
    s.translate(-m.x, -m.y);
    s.beginPath();
    s.arc(m.x, m.y, m.rx, 0, Math.PI * 2);
    s.fill();
    s.restore();
  }
  // горы: камень, на вершинах снег
  const { mounts, volcs } = reliefOf(art);
  for (const m of mounts) {
    const r = 22 * m.s;
    const g = s.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
    g.addColorStop(0, m.snow || art.id === 'frozen' ? '#e9eef2' : '#a39b8b');
    g.addColorStop(1, 'transparent');
    s.globalAlpha = 0.7;
    s.fillStyle = g;
    s.fillRect(m.x - r, m.y - r, r * 2, r * 2);
  }
  for (const v of volcs) {
    const r = 30 * v.s;
    const g = s.createRadialGradient(v.x, v.y, 0, v.x, v.y, r);
    g.addColorStop(0, '#4a3c34');
    g.addColorStop(1, 'transparent');
    s.globalAlpha = 0.8;
    s.fillStyle = g;
    s.fillRect(v.x - r, v.y - r, r * 2, r * 2);
  }
  s.globalAlpha = 1;

  // пятнистость земли — шумом по пикселям малого холста (шум — раз на карту)
  const img = s.getImageData(0, 0, sw, sh);
  const tone = toneOf(art.id, sw, sh);
  for (let i = 0; i < tone.length; i++) {
    const k = 1 + tone[i]!;
    for (let c = 0; c < 3; c++) img.data[i * 4 + c] = Math.max(0, Math.min(255, img.data[i * 4 + c]! * k));
  }
  s.putImageData(img, 0, 0);

  const out = canvas(W, H);
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  o.drawImage(soft, 0, 0, W, H);
  o.scale(k, k);
  o.lineCap = 'round';
  o.lineJoin = 'round';

  // поля — штриховкой
  const fields = art.id === 'frozen' ? [] : art.art.fields;
  o.strokeStyle = '#d2bd6c';
  o.globalAlpha = 0.6;
  o.lineWidth = 4.2;
  for (const d of fields) o.stroke(new Path2D(d));
  o.strokeStyle = '#b39b52';
  o.globalAlpha = 0.5;
  o.lineWidth = 1.2;
  for (const d of fields) o.stroke(new Path2D(d));
  o.globalAlpha = 1;

  // реки и озеро
  for (const r of riversOf(art)) {
    const p = new Path2D(r.d);
    o.strokeStyle = '#6f8452';
    o.globalAlpha = 0.55;
    o.lineWidth = r.w * 2 + 5;
    o.stroke(p);
    o.globalAlpha = 1;
    o.strokeStyle = '#4a86a4';
    o.lineWidth = r.w * 1.5 + 1.5;
    o.stroke(p);
  }
  if (art.id === 'frozen') {
    const p = new Path2D(art.art.lake);
    o.fillStyle = '#6aa3bd';
    o.fill(p);
    o.strokeStyle = '#d9eef4';
    o.lineWidth = 3;
    o.stroke(p);
  }

  // границы земель
  const dashed = (d: string, color: string, width: number) => {
    const p = new Path2D(d);
    o.setLineDash([]);
    o.strokeStyle = '#f5eedb';
    o.globalAlpha = 0.45;
    o.lineWidth = width + 3;
    o.stroke(p);
    o.globalAlpha = 0.85;
    o.strokeStyle = color;
    o.lineWidth = width;
    o.setLineDash([9, 3, 1.5, 3]);
    o.stroke(p);
    o.setLineDash([]);
    o.globalAlpha = 1;
  };
  if (art.id === 'razdolye') dashed(art.art.land, '#4a3a26', 2);
  if (art.id === 'frozen') {
    dashed(art.art.nLine, '#4a3a26', 1.8);
    dashed(art.art.sLine, '#4a3a26', 1.8);
    o.strokeStyle = '#5d564b';
    o.globalAlpha = 0.6;
    o.lineWidth = 10;
    o.stroke(new Path2D(art.art.wall));
    o.globalAlpha = 1;
  }
  for (const r of regions) if (r.border && r.visible !== false) dashed(ringsPath(r.shape), r.edge, 2.2);

  // дороги
  for (const r of roads) {
    const p = new Path2D(r.d);
    if (r.open === false) o.setLineDash([4, 6]);
    o.strokeStyle = '#5e4a30';
    o.globalAlpha = r.open === false ? 0.25 : 0.4;
    o.lineWidth = 4.6;
    o.stroke(p);
    o.strokeStyle = '#c2a674';
    o.globalAlpha = r.open === false ? 0.5 : 1;
    o.lineWidth = 2.8;
    o.stroke(p);
    o.setLineDash([]);
  }
  o.globalAlpha = 1;

  // мастеру: скрытые регионы — серой штриховкой
  if (gm) {
    const hatch = canvas(12, 12);
    const hx = hatch.getContext('2d')!;
    hx.fillStyle = 'rgba(58,44,28,.16)';
    hx.fillRect(0, 0, 12, 12);
    hx.strokeStyle = 'rgba(58,44,28,.45)';
    hx.lineWidth = 1.6;
    hx.beginPath();
    hx.moveTo(-2, 14);
    hx.lineTo(14, -2);
    hx.stroke();
    const pat = o.createPattern(hatch, 'repeat');
    if (pat) {
      o.fillStyle = pat;
      for (const r of regions) if (r.visible === false) o.fill(new Path2D(ringsPath(r.shape)));
    }
  }
  return out;
}

// ---- туман ----

export type FogMask = { w: number; h: number; data: Uint8Array; at: (x: number, y: number) => number };

/** Маска тумана: 1 — туман, 0 — открыто. Мастеру тумана нет. Край размыт. */
export function fogMask(regions: ViewRegion[], fog: boolean): FogMask {
  const w = 200,
    h = 138;
  const data = new Uint8Array(w * h);
  if (fog) {
    const c = canvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.scale(w / MAP_W, h / MAP_H);
    ctx.fillStyle = '#000';
    for (const r of regions) if (r.visible !== false) ctx.fill(new Path2D(ringsPath(r.shape)));
    const img = ctx.getImageData(0, 0, w, h).data;
    const f = new Float32Array(w * h);
    for (let i = 0; i < f.length; i++) f[i] = img[i * 4]! / 255;
    // край: сначала расширить открытое (туман не наползает на границу), потом размыть
    const b = blur(f, w, h, 2, 2);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, (b[i]! - 0.35) / 0.65)) * 255);
  }
  const at = (x: number, y: number) => {
    const i = Math.min(w - 1, Math.max(0, Math.round((x / MAP_W) * (w - 1))));
    const j = Math.min(h - 1, Math.max(0, Math.round((y / MAP_H) * (h - 1))));
    return data[j * w + i]! / 255;
  };
  return { w, h, data, at };
}
