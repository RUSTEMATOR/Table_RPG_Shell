// SVG-путь → ломаные (для стен, подписей регионов по дуге, дорог). Рисование путей в текстуру идёт через Path2D,
// здесь — только то, где нужны сами точки. Команды: M L H V C S Q T Z (и строчные). Дуг (A) в данных карт нет.

export type Pt = [number, number];

const TOKEN = /([MLHVCSQTZmlhvcsqtz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;

/** Ломаные пути: кривые разбиваются на steps отрезков. */
export function flatten(d: string, steps = 8): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  let cmd = '';
  const nums: number[] = [];
  let x = 0,
    y = 0,
    sx = 0,
    sy = 0;
  let cx = 0,
    cy = 0; // последняя контрольная точка (для S и T)
  let prev = '';

  const push = (px: number, py: number) => cur.push([px, py]);
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps,
        u = 1 - t;
      push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey);
    }
    cx = x2;
    cy = y2;
    x = ex;
    y = ey;
  };
  const quad = (x1: number, y1: number, ex: number, ey: number) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps,
        u = 1 - t;
      push(u * u * x + 2 * u * t * x1 + t * t * ex, u * u * y + 2 * u * t * y1 + t * t * ey);
    }
    cx = x1;
    cy = y1;
    x = ex;
    y = ey;
  };

  const run = () => {
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = () => (rel ? x : 0),
      oy = () => (rel ? y : 0);
    let i = 0;
    const need = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0 }[C] ?? 0;
    if (C === 'Z') {
      if (cur.length) cur.push([sx, sy]);
      x = sx;
      y = sy;
      prev = 'Z';
      return;
    }
    while (i + need <= nums.length && need > 0) {
      const a = nums.slice(i, i + need);
      i += need;
      switch (C) {
        case 'M': {
          // первая пара — переход, остальные пары после M — это L
          x = a[0]! + ox();
          y = a[1]! + oy();
          if (i === need) {
            if (cur.length > 1) out.push(cur);
            cur = [[x, y]];
            sx = x;
            sy = y;
          } else push(x, y);
          break;
        }
        case 'L':
          x = a[0]! + ox();
          y = a[1]! + oy();
          push(x, y);
          break;
        case 'H':
          x = a[0]! + ox();
          push(x, y);
          break;
        case 'V':
          y = a[0]! + oy();
          push(x, y);
          break;
        case 'C': {
          const o = [ox(), oy()] as const;
          cubic(a[0]! + o[0], a[1]! + o[1], a[2]! + o[0], a[3]! + o[1], a[4]! + o[0], a[5]! + o[1]);
          break;
        }
        case 'S': {
          const o = [ox(), oy()] as const;
          const rx = prev === 'C' || prev === 'S' ? 2 * x - cx : x;
          const ry = prev === 'C' || prev === 'S' ? 2 * y - cy : y;
          cubic(rx, ry, a[0]! + o[0], a[1]! + o[1], a[2]! + o[0], a[3]! + o[1]);
          break;
        }
        case 'Q': {
          const o = [ox(), oy()] as const;
          quad(a[0]! + o[0], a[1]! + o[1], a[2]! + o[0], a[3]! + o[1]);
          break;
        }
        case 'T': {
          const rx = prev === 'Q' || prev === 'T' ? 2 * x - cx : x;
          const ry = prev === 'Q' || prev === 'T' ? 2 * y - cy : y;
          quad(rx, ry, a[0]! + ox(), a[1]! + oy());
          break;
        }
      }
      prev = C;
    }
  };

  for (const m of d.matchAll(TOKEN)) {
    if (m[1]) {
      if (cmd) run();
      cmd = m[1];
      nums.length = 0;
    } else nums.push(Number(m[2]));
  }
  if (cmd) run();
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Длина ломаной. */
export function length(line: Pt[]): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
  return s;
}

/** Точки через каждые step единиц вдоль ломаной: координата и направление (угол в радианах). */
export function along(line: Pt[], step: number, offset = step / 2): { x: number; y: number; a: number }[] {
  const out: { x: number; y: number; a: number }[] = [];
  let need = offset;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1]!;
    const [x1, y1] = line[i]!;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (!seg) continue;
    let at = 0;
    while (at + need <= seg) {
      at += need;
      const t = at / seg;
      out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a: Math.atan2(y1 - y0, x1 - x0) });
      need = step;
    }
    need -= seg - at;
  }
  return out;
}

/** Точка посередине ломаной (по длине). */
export function midpoint(line: Pt[]): { x: number; y: number } {
  const p = along(line, Number.POSITIVE_INFINITY, length(line) / 2)[0];
  return p ?? { x: line[0]?.[0] ?? 0, y: line[0]?.[1] ?? 0 };
}
