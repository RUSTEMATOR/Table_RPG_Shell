import * as THREE from 'three';
import { cross, dot, len, norm, sub, type DieModel, type V3 } from './geometry.ts';

// Сетка кубика и атлас граней. Атлас рисуется на canvas цветами темы (токены --primary / --primary-text),
// число на каждой грани стоит «головой» к опорной вершине, у 6 и 9 подчёркивание.

const COLS = 5, ROWS = 4, SIZE = 1024;

export type DieColors = { body: string; ink: string; edge: string; font: string };

export function themeDieColors(): DieColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
  const font = v('--ct-display', '') || "'IBM Plex Mono', ui-monospace, monospace";
  return { body: v('--primary', '#1f7a4d'), ink: v('--primary-text', '#ffffff'), edge: 'rgba(0,0,0,.28)', font };
}

function faceFrame(model: DieModel, f: number): { t: V3; b: V3 } {
  const n = model.normals[f]!, c = model.centers[f]!;
  const toRef = sub(model.vertices[model.ref[f]!]!, c);
  const t = norm(sub(toRef, [n[0] * dot(toRef, n), n[1] * dot(toRef, n), n[2] * dot(toRef, n)]));
  return { t, b: cross(n, t) };
}

/** Геометрия без индексов: у каждой грани свои UV в ячейке атласа и своя нормаль (плоские грани). */
export function buildGeometry(model: DieModel): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [];
  const cw = SIZE / COLS, ch = SIZE / ROWS;
  model.faces.forEach((face, f) => {
    const c = model.centers[f]!, n = model.normals[f]!, { t, b } = faceFrame(model, f);
    const local = face.map((i) => {
      const d = sub(model.vertices[i]!, c);
      return [dot(d, t), dot(d, b)] as const;
    });
    const rmax = Math.max(...local.map(([x, y]) => Math.hypot(x, y)));
    const s = (Math.min(cw, ch) / 2) * 0.94 / rmax;
    const cx = (f % COLS) * cw + cw / 2, cy = Math.floor(f / COLS) * ch + ch / 2;
    const uvOf = (k: number) => {
      const [x, y] = local[k]!;
      return [(cx - y * s) / SIZE, 1 - (cy - x * s) / SIZE];
    };
    const tris = face.length === 3 ? [[0, 1, 2]] : [[0, 1, 2], [0, 2, 3]];
    for (const tri of tris)
      for (const k of tri) {
        const p = model.vertices[face[k]!]!;
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
        uv.push(...uvOf(k));
      }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Атлас: фон грани, тонкая обводка, число. */
export function buildAtlas(model: DieModel, colors: DieColors): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colors.body;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const cw = SIZE / COLS, ch = SIZE / ROWS;
  const tri = model.kind === 'd20';
  model.faces.forEach((_, f) => {
    const cx = (f % COLS) * cw + cw / 2, cy = Math.floor(f / COLS) * ch + ch / 2;
    const label = String(model.labels[f]);
    const size = Math.min(cw, ch) * (tri ? 0.3 : 0.34);
    const dy = tri ? 0 : size * 0.18; // у «воздушного змея» число ближе к широкой части
    ctx.fillStyle = colors.ink;
    ctx.font = `600 ${size}px ${colors.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + dy);
    if (label === '6' || label === '9') {
      const w = ctx.measureText(label).width;
      ctx.fillRect(cx - w / 2, cy + dy + size * 0.48, w, Math.max(3, size * 0.07));
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export const atlasSize = { cols: COLS, rows: ROWS, size: SIZE, len };
