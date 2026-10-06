import { FIGURE_SLOTS, type Figure, type FigureSlot } from '@zg/shared';
import { item, palettes, type Anim, type BodyType, type Item, type Layer, type Material } from './catalog.ts';

// Сборка листа анимации фигурки из слоёв LPC: загрузка, перекраска по палитре, порядок по z.
// Обычные кадры — 64×64; у крупного удара (меч, булава) — 192×192, кадр тела по центру.
// Ряды: вверх, влево, вниз, вправо; у «ранен» — один ряд. Результат кэшируется по описанию фигурки.

export type Sheet = { canvas: HTMLCanvasElement; cell: number; cols: number; rows: number };

const BASE = '/lpc/sheets/';
const images = new Map<string, Promise<HTMLImageElement | null>>();
function load(url: string): Promise<HTMLImageElement | null> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

const hex = (h: string) => {
  const v = parseInt(h.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const;
};

/** Перекраска: цвета исходной палитры материала → цвета выбранной (одинаковый порядок оттенков). */
const recolored = new Map<string, Promise<CanvasImageSource | null>>();
function recolor(url: string, material: Material, from: string, to: string): Promise<CanvasImageSource | null> {
  if (from === to) return load(url);
  const key = `${url}|${material}|${from}|${to}`;
  let p = recolored.get(key);
  if (!p) {
    p = load(url).then((img) => {
      if (!img) return null;
      const src = palettes[material]?.[from];
      const dst = palettes[material]?.[to];
      if (!src || !dst) return img;
      const map = src.map((c, i) => [hex(c), hex(dst[Math.min(i, dst.length - 1)]!)] as const);
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const d = data.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        for (const [[r, g, b], [r2, g2, b2]] of map) {
          if (Math.abs(d[i]! - r) <= 1 && Math.abs(d[i + 1]! - g) <= 1 && Math.abs(d[i + 2]! - b) <= 1) {
            d[i] = r2;
            d[i + 1] = g2;
            d[i + 2] = b2;
            break;
          }
        }
      }
      ctx.putImageData(data, 0, 0);
      return c;
    });
    recolored.set(key, p);
  }
  return p;
}

type Part = { slot: FigureSlot; it: Item; color?: string };
function partsOf(f: Figure): Part[] {
  const out: Part[] = [];
  for (const slot of FIGURE_SLOTS) {
    const p = f.parts[slot];
    const it = item(slot, p?.id);
    if (it && it.bodies.includes(f.body)) out.push({ slot, it, ...(p?.color ? { color: p.color } : {}) });
  }
  return out;
}

/** Файл слоя для анимации; null — у слоя этой анимации нет. */
function fileOf(layer: Layer, body: BodyType, anim: Anim, it: Item, color: string | undefined): string | null {
  const path = layer.paths[body];
  if (!path || !layer.anims.includes(anim)) return null;
  if (layer.fixed) return `${BASE}${path}${anim}/${layer.fixed}.png`;
  if (it.colors?.kind === 'variants') {
    const v = color && it.colors.list.includes(color) ? color : it.colors.list[0]!;
    return layer.oversize ? `${BASE}${path}${v}.png` : `${BASE}${path}${anim}/${v}.png`;
  }
  return `${BASE}${path}${anim}.png`;
}

/** Атака фигурки — по оружию; без оружия — удар рукой. */
export function attackOf(f: Figure): Anim {
  return item('weapon', f.parts.weapon?.id)?.attack ?? 'slash';
}

const sheets = new Map<string, Promise<Sheet | null>>();

/** Лист анимации фигурки. idle у деталей без «стоит» берётся из первого кадра ходьбы. */
export function sheetOf(f: Figure, anim: Anim): Promise<Sheet | null> {
  const key = `${JSON.stringify(f)}|${anim}`;
  let p = sheets.get(key);
  if (!p) {
    p = build(f, anim);
    sheets.set(key, p);
    if (sheets.size > 80) sheets.delete(sheets.keys().next().value!);
  }
  return p;
}

async function build(f: Figure, anim: Anim): Promise<Sheet | null> {
  const parts = partsOf(f);
  type Draw = { z: number; img: CanvasImageSource & { width: number; height: number }; oversize: boolean; fromWalk: boolean };
  const draws: Draw[] = [];
  await Promise.all(
    parts.flatMap(({ slot, it, color }) =>
      it.layers.map(async (layer) => {
        let fromWalk = false;
        let file = fileOf(layer, f.body, anim, it, color);
        if (!file && anim === 'idle' && !layer.oversize) {
          file = fileOf(layer, f.body, 'walk', it, color);
          fromWalk = !!file;
        }
        if (!file) return;
        const c = it.colors;
        const target = c?.kind === 'palette' ? (c.material === 'body' && (slot === 'body' || slot === 'head' || slot === 'feet') ? f.skin : (color ?? c.base)) : undefined;
        const img = c?.kind === 'palette' && target ? await recolor(file, c.material, c.base, target) : await load(file);
        if (img) draws.push({ z: layer.z, img: img as Draw['img'], oversize: !!layer.oversize, fromWalk });
      }),
    ),
  );
  if (!draws.length) return null;
  draws.sort((a, b) => a.z - b.z);
  const big = draws.some((d) => d.oversize);
  const cell = big ? 192 : 64;
  const off = (cell - 64) / 2;
  const ref = draws.find((d) => !d.oversize && !d.fromWalk) ?? draws[0]!;
  const cols = ref.oversize ? Math.round(ref.img.width / 192) : Math.round(ref.img.width / 64);
  const rows = ref.oversize ? Math.round(ref.img.height / 192) : Math.round(ref.img.height / 64);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (const d of draws) {
    if (d.oversize) {
      ctx.drawImage(d.img, 0, 0);
      continue;
    }
    const dc = Math.round(d.img.width / 64);
    const dr = Math.round(d.img.height / 64);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        // кадр «стоит» из ходьбы: первый кадр того же направления
        const sc = d.fromWalk ? 0 : Math.min(col, dc - 1);
        const sr = Math.min(r, dr - 1);
        ctx.drawImage(d.img, sc * 64, sr * 64, 64, 64, col * cell + off, r * cell + off, 64, 64);
      }
    }
  }
  return { canvas, cell, cols, rows };
}

/** Заранее подгрузить листы фигурки (например, перед боем на столе). */
export function preloadFigure(f: Figure, anims: Anim[]): Promise<void> {
  return Promise.all(anims.map((a) => sheetOf(f, a))).then(() => undefined);
}
