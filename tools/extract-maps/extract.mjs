// Генератор карт мира: та же геометрия, что в одобренных макетах этапа 15 (холст Claude Design, «Карта · …»).
// Выдаёт два набора и больше ничего не делает:
//   web/src/maps/art/<карта>.json   — рельеф без имён, мест, дорог и границ регионов (клиент, не секрет);
//   server/src/maps/data/<карта>.json — регионы (контуры, имена, подписи), места, дороги (сервер, по видимости).
// Запуск: node tools/extract-maps/extract.mjs. Результат руками не править — менять генератор и запускать снова.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'polygon-clipping';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

// ---------- общие помощники (как в макетах) ----------

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function roughen(pts, iters, amp, r, closed) {
  let p = pts.slice();
  for (let k = 0; k < iters; k++) {
    const n = [],
      L = closed ? p.length : p.length - 1;
    for (let i = 0; i < L; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = Math.hypot(dx, dy) || 1;
      const off = (r() - 0.5) * amp * len;
      n.push(a);
      n.push([(a[0] + b[0]) / 2 - (dy / len) * off, (a[1] + b[1]) / 2 + (dx / len) * off]);
    }
    if (!closed) n.push(p[p.length - 1]);
    p = n;
    amp *= 0.62;
  }
  return p;
}
const fx = (q) => q[0].toFixed(1) + ',' + q[1].toFixed(1);
function smooth(p, closed) {
  const n = p.length;
  let d = 'M' + fx(p[0]);
  const g = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = g(i - 1),
      p1 = g(i),
      p2 = g(i + 1),
      p3 = g(i + 2);
    d += 'C' + fx([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' + fx([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + fx(p2);
  }
  return d + (closed ? 'Z' : '');
}
const poly = (p) => 'M' + p.map(fx).join('L') + 'Z';
const rev = (p) => p.slice().reverse();
function inside(pt, p) {
  const x = pt[0],
    y = pt[1];
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0],
      yi = p[i][1],
      xj = p[j][0],
      yj = p[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function along(p, step, fn) {
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1],
      b = p[i],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    acc += len;
    while (acc >= step) {
      acc -= step;
      const t = 1 - acc / len;
      fn([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], Math.atan2(b[1] - a[1], b[0] - a[0]));
    }
  }
}
const r1 = (v) => Math.round(v * 10) / 10;

/** Упрощение контура (Дуглас — Пекер): отклонение до 0,7 единицы карты (1600×1100) на экране не видно. */
function simplify(pts, eps = 0.7) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a],
      [bx, by] = pts[b];
    const dx = bx - ax,
      dy = by - ay,
      len = Math.hypot(dx, dy) || 1;
    let far = -1,
      best = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > best) {
        best = d;
        far = i;
      }
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
const ring = (pts) => simplify(pts).map((q) => [r1(q[0]), r1(q[1])]);

/** Контур(ы) региона: результат polygon-clipping → список внешних колец (дыр у наших регионов нет). */
function rings(multi) {
  return multi
    .map((polygon) => polygon[0])
    .filter((r) => r.length > 3)
    .map((r) => ring(r.slice(0, -1)));
}
const CANVAS = [
  [
    [-20, -20],
    [1620, -20],
    [1620, 1120],
    [-20, 1120],
    [-20, -20],
  ],
];
const close = (p) => [[...p, p[0]]];
const clipCanvas = (p) => rings(pc.intersection(close(p), CANVAS));

/** Дороги между местами: ближайшие соседи (как в макете), концы — ключи мест. */
function roadsBetween(places, seed, maxD, isBig) {
  const out = [],
    rr = rng(seed);
  places.forEach((a, i) => {
    places
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter((o) => o.j > i)
      .sort((x, y) => x.d - y.d)
      .slice(0, isBig(a) ? 3 : 1)
      .forEach((o) => {
        if (o.d > maxD) return;
        const b = places[o.j];
        out.push({
          a: a.key,
          b: b.key,
          d: smooth(
            roughen(
              [
                [a.x, a.y],
                [b.x, b.y],
              ],
              3,
              0.22,
              rr,
              false,
            ),
            false,
          ),
        });
      });
  });
  return out;
}

// ---------- Мир ----------

function buildWorld() {
  const coastPts = [
    [-80, -80],
    [1680, -80],
    [1680, 1180],
    [-80, 1180],
  ];
  const line = (pts, seed, amp) => roughen(pts, 6, amp || 0.46, rng(seed), false);
  const J1 = [520, 440],
    J2 = [1040, 330],
    J3 = [540, 800],
    J4 = [1030, 640],
    J5 = [990, 800];
  const G1 = line([[40, 430], [170, 452], [300, 400], [420, 424], J1], 11),
    G2 = line([J1, [610, 400], [700, 360], [820, 396], [900, 370], J2], 12),
    G3 = line([J2, [1140, 350], [1250, 300], [1400, 342], [1580, 330]], 13);
  const D1 = line([J1, [545, 530], [585, 630], [540, 720], J3], 14),
    D1b = line([J3, [600, 880], [560, 980], [600, 1100]], 15);
  const D2 = line([J2, [1060, 420], [1000, 520], [1050, 580], J4], 16),
    D2b = line([J4, [1000, 720], J5], 17);
  const S1 = line([J3, [650, 830], [760, 860], [880, 820], J5], 18),
    E1 = line([J4, [1140, 690], [1250, 650], [1380, 680], [1580, 600]], 19),
    D3 = line([J5, [1040, 880], [1020, 960], [1100, 1100]], 20);
  const riverMain = line(
    [
      [880, 250],
      [860, 330],
      [820, 420],
      [760, 560],
      [800, 720],
      [760, 840],
      [770, 1060],
    ],
    31,
    0.3,
  );
  const K = riverMain.filter((q) => q[1] > 300 && q[1] < 900);

  const razd = G2.concat(D2, D2b, rev(S1), rev(D1));
  const kingWest = [[K[0][0], 200]].concat(K, [
    [K[K.length - 1][0], 1000],
    [400, 1000],
    [400, 200],
  ]);
  const arc = (path, size, spacing) => ({ path, size, spacing, ink: '#3a2c1c' });
  const regions = [
    {
      key: 'greenvales',
      name: 'Зелёные долины',
      shape: clipCanvas(
        G1.concat(G2, G3, [
          [1640, -60],
          [-40, -60],
        ]),
      ),
      fill: '#a7c08a',
      edge: '#557040',
      border: true,
      label: arc('M380 262 Q800 196 1240 262', 40, 14),
    },
    {
      key: 'bloodmist',
      name: 'Бладмист',
      shape: clipCanvas([[-40, 430]].concat(G1, D1, D1b, [[-40, 1160]])),
      fill: '#9c6b78',
      edge: '#4f2533',
      border: true,
      label: arc('M232 900 Q250 690 330 520', 32, 12),
    },
    {
      key: 'razdolye',
      name: 'Раздолье',
      shape: clipCanvas(razd),
      fill: '#9fb3cc',
      edge: '#3a5478',
      border: true,
      link: 'razdolye',
      label: arc('M590 612 Q790 572 990 612', 40, 14),
      // западное королевство внутри Раздолья — тон, а не отдельный регион мира
      extra: [{ shape: rings(pc.intersection(close(kingWest), close(razd))), fill: '#d39b7c' }],
    },
    {
      key: 'frozen',
      name: 'Замёрзшие земли',
      shape: clipCanvas(
        G3.concat(
          [
            [1660, 330],
            [1660, 600],
          ],
          rev(E1),
          rev(D2),
        ),
      ),
      fill: '#dfe7ef',
      edge: '#7f93ab',
      border: true,
      link: 'frozen',
      label: arc('M1050 520 Q1250 470 1460 520', 28, 6),
    },
    {
      key: 'cursed',
      name: 'Проклятые земли',
      shape: clipCanvas(
        E1.concat(
          [
            [1660, 600],
            [1660, 1160],
            [1100, 1160],
          ],
          rev(D3),
          rev(D2b),
        ),
      ),
      fill: '#ddc98d',
      edge: '#7d6526',
      border: true,
      label: arc('M1040 880 Q1240 836 1450 880', 28, 6),
    },
    {
      key: 'burned',
      name: 'Сгоревшие земли',
      shape: clipCanvas(
        S1.concat(
          D3,
          [
            [1100, 1160],
            [600, 1160],
          ],
          rev(D1b),
        ),
      ),
      fill: '#a39a8e',
      edge: '#3d3630',
      border: true,
      label: arc('M590 978 Q800 1010 1010 970', 26, 6),
    },
  ];

  const river = (pts, seed, w) => ({ d: smooth(line(pts, seed, 0.3), false), w, halo: w + 3 });
  const rivers = [
    { d: smooth(riverMain, false), w: 2.8, halo: 6 },
    river(
      [
        [430, 560],
        [330, 640],
        [250, 700],
        [120, 720],
      ],
      32,
      2,
    ),
    river(
      [
        [1300, 420],
        [1380, 560],
        [1490, 610],
      ],
      33,
      1.8,
    ),
    river(
      [
        [1060, 200],
        [1000, 140],
        [960, 80],
      ],
      34,
      1.6,
    ),
  ];

  const mounts = [],
    hills = [];
  function range(pts, seed, light, shade, snow, count, sc, spread) {
    const rr = rng(seed),
      path = roughen(pts, 4, 0.3, rr, false);
    for (let i = 0; i < count; i++) {
      const k = Math.floor(rr() * (path.length - 1)),
        a = path[k],
        b = path[k + 1],
        t = rr();
      const px = a[0] + (b[0] - a[0]) * t,
        py = a[1] + (b[1] - a[1]) * t;
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = Math.hypot(dx, dy) || 1;
      const g = (rr() + rr() + rr() - 1.5) / 1.5,
        off = g * spread;
      const x = px - (dy / len) * off,
        y = py + (dx / len) * off;
      if (!inside([x, y], coastPts)) continue;
      const s = sc * (1.15 - Math.abs(g) * 0.55) * (0.8 + rr() * 0.4);
      mounts.push({ x: r1(x), y: r1(y), s: Math.round(s * 100) / 100, light, shade, snow: snow && Math.abs(g) < 0.6 });
      if (Math.abs(g) > 0.55 && rr() < 0.7) hills.push({ d: 'M' + (x - 10).toFixed(1) + ',' + (y + 6).toFixed(1) + 'q10,-9 20,0', c: '#6b5a3c' });
    }
  }
  range(
    [
      [1070, 440],
      [1180, 400],
      [1300, 450],
      [1440, 410],
    ],
    51,
    '#f1f4f7',
    '#a6b3c3',
    true,
    70,
    1.55,
    34,
  );
  range(
    [
      [1110, 575],
      [1230, 555],
      [1370, 592],
    ],
    52,
    '#f1f4f7',
    '#a6b3c3',
    true,
    40,
    1.25,
    22,
  );
  range(
    [
      [530, 215],
      [620, 180],
      [700, 170],
      [860, 205],
    ],
    53,
    '#efe6cc',
    '#b7a37a',
    false,
    50,
    1.2,
    26,
  );
  range(
    [
      [470, 470],
      [520, 560],
      [505, 700],
    ],
    54,
    '#ebdfc4',
    '#ab9672',
    false,
    22,
    0.95,
    14,
  );
  range(
    [
      [1110, 900],
      [1200, 960],
      [1320, 935],
    ],
    55,
    '#efe0aa',
    '#b39a52',
    false,
    26,
    1.05,
    18,
  );
  mounts.sort((a, b) => a.y - b.y);

  const trees = [],
    woods = [];
  function forest(shape, seed, base, tones, ink, n) {
    const rr = rng(seed),
      outline = roughen(shape, 4, 0.45, rr, true);
    woods.push({ d: smooth(outline, true), base });
    let minx = 1e9,
      maxx = -1e9,
      miny = 1e9,
      maxy = -1e9;
    outline.forEach((q) => {
      minx = Math.min(minx, q[0]);
      maxx = Math.max(maxx, q[0]);
      miny = Math.min(miny, q[1]);
      maxy = Math.max(maxy, q[1]);
    });
    for (let i = 0; i < n; i++) {
      const x = minx + rr() * (maxx - minx),
        y = miny + rr() * (maxy - miny);
      if (!inside([x, y], outline) || !inside([x, y], coastPts)) continue;
      trees.push({ x: r1(x), y: r1(y), r: r1(3 + rr() * 2.6), fill: tones[Math.floor(rr() * tones.length)], ink });
    }
  }
  forest(
    [
      [230, 270],
      [360, 250],
      [460, 290],
      [430, 340],
      [300, 350],
      [220, 320],
    ],
    61,
    '#7f9c5d',
    ['#6f8f4e', '#7d9a5a', '#5f7f44'],
    '#3b4a2a',
    260,
  );
  forest(
    [
      [920, 210],
      [1040, 190],
      [1110, 230],
      [1060, 270],
      [950, 270],
    ],
    62,
    '#7f9c5d',
    ['#6f8f4e', '#7d9a5a', '#5f7f44'],
    '#3b4a2a',
    200,
  );
  forest(
    [
      [640, 280],
      [730, 270],
      [760, 310],
      [680, 320],
    ],
    63,
    '#8aa66a',
    ['#7d9a5a', '#6f8f4e'],
    '#3b4a2a',
    70,
  );
  forest(
    [
      [230, 680],
      [340, 660],
      [380, 740],
      [300, 790],
      [220, 760],
    ],
    64,
    '#6e5260',
    ['#5f4a52', '#6e5260', '#4d3a44'],
    '#2e2228',
    170,
  );
  forest(
    [
      [600, 860],
      [680, 850],
      [700, 890],
      [620, 900],
    ],
    65,
    '#857a62',
    ['#7a6e57', '#6b604c'],
    '#3d3424',
    50,
  );
  trees.sort((a, b) => a.y - b.y);

  const tufts = [],
    cracks = [],
    rt = rng(71);
  for (let i = 0; i < 60; i++) {
    const x = 200 + rt() * 300,
      y = 500 + rt() * 480;
    if (!inside([x, y], coastPts) || x > 520) continue;
    tufts.push('M' + x.toFixed(0) + ',' + y.toFixed(0) + 'l-3,-6M' + x.toFixed(0) + ',' + y.toFixed(0) + 'l0,-8M' + x.toFixed(0) + ',' + y.toFixed(0) + 'l3,-6');
  }
  for (let j = 0; j < 30; j++) {
    const cx = 1090 + rt() * 330,
      cy = 700 + rt() * 260;
    if (!inside([cx, cy], coastPts)) continue;
    cracks.push(
      smooth(
        roughen(
          [
            [cx, cy],
            [cx + 18, cy + 6],
            [cx + 30, cy - 4],
          ],
          3,
          0.6,
          rt,
          false,
        ),
        false,
      ),
    );
  }

  const rh = rng(91);
  const scatter = (n, x0, y0, w, h, fn) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + rh() * w,
        y = y0 + rh() * h;
      if (inside([x, y], coastPts)) fn(x, y);
    }
  };
  scatter(40, 250, 200, 1100, 220, (x, y) => {
    if (y < 330 + (x > 1040 ? -40 : 60)) hills.push({ d: 'M' + (x - 9).toFixed(1) + ',' + y.toFixed(1) + 'q9,-8 18,0', c: '#5a6b3c' });
  });
  scatter(26, 560, 420, 440, 380, (x, y) => {
    hills.push({ d: 'M' + (x - 8).toFixed(1) + ',' + y.toFixed(1) + 'q8,-7 16,0', c: '#6b5a3c' });
  });
  const fields = [];
  scatter(16, 580, 440, 420, 340, (x, y) => {
    const a = rh() * Math.PI,
      dx = Math.cos(a) * 14,
      dy = Math.sin(a) * 14;
    let d = '';
    for (let k = -2; k <= 2; k++)
      d +=
        'M' +
        (x - dx + k * dy * 0.28).toFixed(1) +
        ',' +
        (y - dy - k * dx * 0.28).toFixed(1) +
        'L' +
        (x + dx + k * dy * 0.28).toFixed(1) +
        ',' +
        (y + dy - k * dx * 0.28).toFixed(1);
    fields.push(d);
  });
  const dunes = [];
  scatter(34, 1060, 690, 400, 280, (x, y) => {
    dunes.push('M' + (x - 14).toFixed(1) + ',' + y.toFixed(1) + 'q7,-6 14,0 q7,6 14,0');
  });
  const ice = [];
  scatter(22, 1060, 330, 420, 300, (x, y) => {
    ice.push(
      smooth(
        roughen(
          [
            [x, y],
            [x + 22, y + 4],
          ],
          3,
          0.8,
          rh,
          false,
        ),
        false,
      ),
    );
  });

  const places = [
    { key: 'world-marblewolf', name: 'Marblewolf', kind: 'capital', x: 680, y: 690, side: 'r', ink: '#7a3522' },
    { key: 'world-havenwall', name: 'Havenwall', kind: 'capital', x: 900, y: 700, side: 'r', ink: '#2b4a78' },
    { key: 'world-gusobu', name: 'Гу со Бу', kind: 'bigtown', x: 1250, y: 640, side: 'r' },
  ];

  const art = {
    rivers,
    mounts,
    trees,
    woods,
    hills,
    fields,
    dunes,
    ice,
    tufts,
    cracks,
    volcs: [
      { x: 810, y: 905, s: 1.15 },
      { x: 910, y: 892, s: 1 },
      { x: 735, y: 922, s: 0.8 },
    ],
  };
  return { art, data: { id: 'world', title: 'Мир', parent: null, regions, places, roads: [] } };
}

// ---------- Раздолье ----------

function buildRazdolye() {
  const T = (sx, sy) => [270 + (sx - 150) * 1.21, 120 + (sy - 95) * 0.995];
  const outer = roughen(
    [
      [300, 180],
      [430, 150],
      [560, 120],
      [700, 150],
      [820, 128],
      [950, 110],
      [1080, 120],
      [1200, 150],
      [1310, 170],
      [1370, 280],
      [1345, 400],
      [1365, 520],
      [1335, 640],
      [1380, 760],
      [1360, 880],
      [1260, 990],
      [1120, 1000],
      [980, 1020],
      [860, 985],
      [740, 1010],
      [600, 990],
      [480, 1020],
      [350, 980],
      [262, 870],
      [285, 760],
      [250, 640],
      [290, 520],
      [255, 400],
      [275, 280],
    ],
    6,
    0.4,
    rng(17),
    true,
  );
  const riverMain = roughen(
    [
      [560, 20],
      [575, 140],
      [590, 250],
      [700, 318],
      [815, 354],
      [827, 453],
      [815, 543],
      [923, 583],
      [875, 662],
      [863, 762],
      [1008, 881],
      [984, 1001],
      [1010, 1100],
    ],
    5,
    0.25,
    rng(23),
    false,
  );
  const westHalf = [[riverMain[0][0], -20]].concat(riverMain, [
    [riverMain[riverMain.length - 1][0], 1120],
    [100, 1120],
    [100, -20],
  ]);

  const rv = (pts, seed, w) => ({ d: smooth(roughen(pts, 4, 0.3, rng(seed), false), false), w, halo: w + 3 });
  const rivers = [
    { d: smooth(riverMain, false), w: 3.4, halo: 7 },
    rv(
      [
        [280, 563],
        [600, 548],
        [815, 543],
      ],
      31,
      2,
    ),
    rv(
      [
        [280, 780],
        [560, 770],
        [863, 762],
      ],
      32,
      2,
    ),
    rv(
      [
        [1400, 540],
        [1110, 566],
        [923, 583],
      ],
      33,
      2,
    ),
    rv(
      [
        [1400, 760],
        [1090, 740],
        [875, 700],
      ],
      34,
      1.8,
    ),
    rv(
      [
        [900, 40],
        [860, 200],
        [815, 354],
      ],
      35,
      1.8,
    ),
  ];

  // [имя, x, y, вид, королевство (w/e), сторона подписи, подзаголовок]
  const raw = [
    ['Nern Garom', 222, 395, 'city', 'w', 'r'],
    ['Mallowshade', 497, 436, 'city', 'w', 'r'],
    ['Strongcrest', 252, 500, 'city', 'w', 'r'],
    ['Oroak', 433, 565, 'city', 'w', 'r'],
    ['Marblewolf', 590, 602, 'capital', 'w', 'l', 'столица · гильдия Widelan'],
    ['Witchcliff', 222, 647, 'city', 'w', 'r'],
    ['Eriflower', 372, 658, 'city', 'w', 'r'],
    ['Castlefair', 370, 773, 'city', 'w', 'r'],
    ['Magewald', 510, 773, 'city', 'w', 'r', 'гильдия Traitors betrayed'],
    ['Dorpine', 237, 797, 'city', 'w', 'r'],
    ['Woodlyn', 440, 885, 'city', 'w', 'r'],
    ['Eastwyvern', 676, 850, 'city', 'w', 'l'],
    ['Headgeville', 562, 932, 'city', 'w', 'r'],
    ['Falconcastle', 556, 163, 'city', 'e', 'r'],
    ['Aldmoor', 706, 196, 'city', 'e', 'r'],
    ['Nasamel', 523, 275, 'elven', 'e', 'r', 'эльфийский город'],
    ['Mage College', 813, 320, 'college', 'e', 'r'],
    ['Icewinter', 736, 383, 'city', 'e', 'l'],
    ['Windmarsh', 884, 357, 'city', 'e', 'r'],
    ['Marshfall', 910, 513, 'city', 'e', 'r'],
    ['Havenwall', 783, 617, 'capital', 'e', 'b', 'столица · гильдия Shievershifters'],
    ['Cliffspring', 836, 648, 'city', 'e', 'r'],
    ['Raybarrow', 872, 686, 'city', 'e', 'r'],
    ['Mytolenora', 890, 800, 'elven', 'e', 'r', 'эльфийский город'],
    ['Fyll Sari', 960, 890, 'city', 'e', 'l'],
    ['Lochtown', 818, 957, 'city', 'e', 'r', 'гильдия Hollowroses'],
  ];
  const places = raw.map((q, i) => {
    const p = T(q[1], q[2]);
    return {
      key: `razd-${i + 1}`,
      name: q[0],
      kind: q[3],
      x: r1(p[0]),
      y: r1(p[1]),
      side: q[5],
      ink: q[4] === 'w' ? '#7a3522' : '#2b4a78',
      ...(q[6] ? { subtitle: q[6] } : {}),
    };
  });
  const roads = roadsBetween(places, 41, 260, (a) => a.kind === 'capital');

  const vill = [
    [195, 350],
    [310, 393],
    [453, 400],
    [195, 474],
    [645, 430],
    [535, 570],
    [517, 655],
    [270, 614],
    [425, 735],
    [298, 788],
    [462, 780],
    [353, 875],
    [513, 897],
    [610, 887],
    [660, 155],
    [590, 218],
    [458, 282],
    [626, 292],
    [745, 272],
    [790, 340],
    [778, 478],
    [884, 483],
    [676, 686],
    [824, 710],
    [892, 620],
    [830, 830],
    [800, 918],
    [905, 962],
    [980, 805],
  ];
  vill.forEach((v, i) => {
    const p = T(v[0], v[1]);
    places.push({ key: `razd-v${i + 1}`, name: '', kind: 'village', x: r1(p[0]), y: r1(p[1]), side: 'r' });
  });

  const trees = [],
    woods = [];
  let twilightOutline = null;
  function forest(shape, seed, base, tones, ink, n, list, clip) {
    const r = rng(seed),
      outline = roughen(shape, 4, 0.45, r, true);
    if (list === trees) woods.push({ d: smooth(outline, true), base });
    if (seed === 51) twilightOutline = outline;
    let minx = 1e9,
      maxx = -1e9,
      miny = 1e9,
      maxy = -1e9;
    outline.forEach((q) => {
      minx = Math.min(minx, q[0]);
      maxx = Math.max(maxx, q[0]);
      miny = Math.min(miny, q[1]);
      maxy = Math.max(maxy, q[1]);
    });
    for (let i = 0; i < n; i++) {
      const x = minx + r() * (maxx - minx),
        y = miny + r() * (maxy - miny);
      if (!inside([x, y], outline)) continue;
      if (clip === 'in' && !inside([x, y], outer)) continue;
      list.push({ x: r1(x), y: r1(y), r: r1(3 + r() * 2.4), fill: tones[Math.floor(r() * tones.length)], ink });
    }
  }
  const tf = T(250, 930);
  forest(
    [
      [tf[0] - 110, tf[1] - 20],
      [tf[0] - 40, tf[1] - 55],
      [tf[0] + 70, tf[1] - 45],
      [tf[0] + 115, tf[1] + 5],
      [tf[0] + 40, tf[1] + 40],
      [tf[0] - 80, tf[1] + 35],
    ],
    51,
    '#6e5a86',
    ['#5f4a78', '#6e5a86', '#4d3c66'],
    '#2e2240',
    200,
    trees,
    'in',
  );
  forest(
    [
      [430, 450],
      [520, 440],
      [540, 490],
      [450, 500],
    ],
    52,
    '#7f9c5d',
    ['#6f8f4e', '#7d9a5a', '#5f7f44'],
    '#3b4a2a',
    70,
    trees,
    'in',
  );
  forest(
    [
      [1120, 800],
      [1240, 790],
      [1270, 850],
      [1150, 870],
    ],
    53,
    '#7f9c5d',
    ['#6f8f4e', '#7d9a5a', '#5f7f44'],
    '#3b4a2a',
    90,
    trees,
    'in',
  );
  forest(
    [
      [960, 200],
      [1060, 190],
      [1080, 240],
      [980, 250],
    ],
    54,
    '#7f9c5d',
    ['#6f8f4e', '#7d9a5a'],
    '#3b4a2a',
    60,
    trees,
    'in',
  );
  trees.sort((a, b) => a.y - b.y);
  const nTrees = [];
  forest(
    [
      [200, 40],
      [420, 30],
      [480, 90],
      [300, 120],
      [180, 90],
    ],
    55,
    '',
    ['#6f8f4e', '#7d9a5a'],
    '',
    120,
    nTrees,
  );
  forest(
    [
      [1000, 40],
      [1200, 30],
      [1250, 80],
      [1080, 110],
    ],
    56,
    '',
    ['#6f8f4e', '#7d9a5a'],
    '',
    90,
    nTrees,
  );

  const mounts = [],
    hills = [],
    mr = rng(61);
  function massif(pts, count, sc, spread, list, clip) {
    const path = roughen(pts, 4, 0.3, mr, false);
    for (let i = 0; i < count; i++) {
      const k = Math.floor(mr() * (path.length - 1)),
        a = path[k],
        b = path[k + 1],
        t = mr();
      const px = a[0] + (b[0] - a[0]) * t,
        py = a[1] + (b[1] - a[1]) * t,
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = Math.hypot(dx, dy) || 1;
      const g = (mr() + mr() + mr() - 1.5) / 1.5,
        x = px - (dy / len) * g * spread,
        y = py + (dx / len) * g * spread;
      if (clip && !inside([x, y], outer)) continue;
      const s = sc * (1.15 - Math.abs(g) * 0.55) * (0.8 + mr() * 0.4);
      list.push({ x: r1(x), y: r1(y), s: Math.round(s * 100) / 100 });
      if (Math.abs(g) > 0.5 && mr() < 0.7) hills.push('M' + (x - 10).toFixed(1) + ',' + (y + 6).toFixed(1) + 'q10,-9 20,0');
    }
    list.sort((a, b) => a.y - b.y);
  }
  massif(
    [
      [1120, 190],
      [1210, 240],
      [1280, 330],
    ],
    46,
    1.25,
    26,
    mounts,
    true,
  );
  massif(
    [
      [330, 250],
      [410, 290],
      [500, 275],
    ],
    26,
    0.95,
    16,
    mounts,
    true,
  );
  massif(
    [
      [1200, 650],
      [1270, 720],
    ],
    16,
    1.0,
    14,
    mounts,
    true,
  );
  const nMounts = [];
  massif(
    [
      [1360, 70],
      [1460, 60],
      [1590, 90],
    ],
    28,
    1.2,
    22,
    nMounts,
    false,
  );

  const fr = rng(71),
    fields = [];
  for (let f = 0; f < 46; f++) {
    const cx = 320 + fr() * 1000,
      cy = 180 + fr() * 780;
    if (!inside([cx, cy], outer)) continue;
    const ang = fr() * Math.PI,
      ddx = Math.cos(ang) * 15,
      ddy = Math.sin(ang) * 15;
    let s = '';
    for (let k = -2; k <= 2; k++)
      s +=
        'M' +
        (cx - ddx + k * ddy * 0.28).toFixed(1) +
        ',' +
        (cy - ddy - k * ddx * 0.28).toFixed(1) +
        'L' +
        (cx + ddx + k * ddy * 0.28).toFixed(1) +
        ',' +
        (cy + ddy - k * ddx * 0.28).toFixed(1);
    fields.push(s);
  }
  for (let h = 0; h < 36; h++) {
    const hx = 320 + fr() * 1000,
      hy = 180 + fr() * 780;
    if (inside([hx, hy], outer)) hills.push('M' + (hx - 9).toFixed(1) + ',' + hy.toFixed(1) + 'q9,-8 18,0');
  }

  const land = close(outer);
  const minusLand = (p) => rings(pc.difference(pc.intersection(close(p), CANVAS), land));
  const muted = (x, y, rotate) => ({ x, y, rotate, size: 22, spacing: 6, ink: '#5b4a33', muted: true });
  const regions = [
    {
      key: 'west',
      name: 'Западное королевство',
      shape: rings(pc.intersection(land, close(westHalf))),
      fill: '#d39b7c',
      edge: '#7a3522',
      label: { path: 'M300 760 Q540 716 790 770', size: 27, spacing: 7, ink: '#6e2f1c' },
    },
    {
      key: 'east',
      name: 'Восточное королевство',
      shape: rings(pc.difference(land, close(westHalf))),
      fill: '#9fb3cc',
      edge: '#2b4a78',
      label: { path: 'M890 476 Q1110 444 1350 486', size: 23, spacing: 4, ink: '#253f6b' },
    },
    {
      key: 'twilight',
      name: 'Сумеречный лес',
      shape: rings(pc.intersection(close(twilightOutline), land)),
      fill: null,
      edge: '#4a2f66',
      label: { x: r1(tf[0]), y: r1(tf[1] + 76), size: 22, ink: '#4a2f66', italic: true },
    },
    {
      key: 'n-green',
      name: 'Зелёные долины',
      shape: minusLand([
        [-20, -20],
        [1620, -20],
        [1620, 200],
        [-20, 260],
      ]),
      fill: '#a7c08a',
      edge: '#557040',
      label: muted(800, 64, 0),
    },
    {
      key: 'n-blood',
      name: 'Бладмист',
      shape: minusLand([
        [-20, 240],
        [330, 220],
        [330, 1120],
        [-20, 1120],
      ]),
      fill: '#9c6b78',
      edge: '#4f2533',
      label: muted(96, 560, -90),
    },
    {
      key: 'n-frozen',
      name: 'Замёрзшие земли',
      shape: minusLand([
        [1280, 0],
        [1620, 0],
        [1620, 640],
        [1300, 640],
      ]),
      fill: '#dfe7ef',
      edge: '#7f93ab',
      link: 'frozen',
      label: muted(1508, 330, 90),
    },
    {
      key: 'n-cursed',
      name: 'Проклятые земли',
      shape: minusLand([
        [1300, 640],
        [1620, 640],
        [1620, 1120],
        [1200, 1120],
      ]),
      fill: '#ddc98d',
      edge: '#7d6526',
      label: muted(1508, 840, 90),
    },
    {
      key: 'n-burned',
      name: 'Сгоревшие земли',
      shape: minusLand([
        [330, 960],
        [1250, 960],
        [1200, 1120],
        [330, 1120],
      ]),
      fill: '#a39a8e',
      edge: '#3d3630',
      label: muted(760, 1058, 0),
    },
  ];

  const art = {
    land: smooth(outer, true),
    rivers,
    trees,
    woods,
    nTrees,
    mounts,
    nMounts,
    hills,
    fields,
    twilight: { x: r1(tf[0]), y: r1(tf[1]) },
  };
  return { art, data: { id: 'razdolye', title: 'Раздолье', parent: 'world', regions, places, roads } };
}

// ---------- Замёрзшие земли ----------

function buildFrozen() {
  const T = (sx, sy) => [80 + sx * 1.15, 60 + sy * 1.15];
  const Tl = (list) => list.map((q) => T(q[0], q[1]));
  const N = roughen(
    [[-60, 250]].concat(
      Tl([
        [0, 255],
        [230, 242],
        [300, 205],
        [430, 95],
        [650, 95],
        [700, 105],
        [860, 65],
        [1000, 110],
        [1180, 190],
        [1251, 215],
      ]),
      [[1660, 330]],
    ),
    4,
    0.35,
    rng(11),
    false,
  );
  const S = roughen(
    [[-60, 700]].concat(
      Tl([
        [0, 575],
        [160, 562],
        [150, 640],
        [190, 800],
        [300, 805],
        [500, 822],
        [700, 805],
        [1000, 800],
        [1251, 815],
      ]),
      [[1660, 1000]],
    ),
    4,
    0.35,
    rng(12),
    false,
  );
  const frozenPts = N.concat(rev(S));
  const wallPts = roughen(
    Tl([
      [258, 245],
      [262, 330],
      [272, 400],
      [268, 480],
      [225, 535],
      [162, 562],
    ]),
    3,
    0.15,
    rng(13),
    false,
  );
  const merlons = [];
  along(wallPts, 14, (q, ang) => merlons.push({ x: r1(q[0]), y: r1(q[1]), a: r1((ang * 180) / Math.PI) }));
  const sr = rng(21),
    base = Tl([
      [830, 40],
      [805, 150],
      [812, 230],
      [800, 395],
      [772, 470],
      [772, 520],
      [765, 600],
      [772, 760],
      [775, 880],
    ]);
  const stormPts = roughen(base, 5, 0.3, sr, false).map((q, i) => [q[0] + Math.sin(i * 0.22) * 22 + Math.sin(i * 0.07) * 30, q[1]]);
  const eye = T(770, 495);
  const vortex = [];
  for (let v = 0; v < 4; v++) {
    const pts = [],
      r0 = 14 + v * 14;
    for (let a = 0; a <= 5.2; a += 0.25) {
      const rr = r0 + a * 6;
      pts.push([eye[0] + Math.cos(a + v * 1.6) * rr, eye[1] + Math.sin(a + v * 1.6) * rr * 0.8]);
    }
    vortex.push(smooth(pts, false));
  }
  const lc = T(730, 155),
    lakePts = [];
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    lakePts.push([lc[0] + Math.cos(ang) * 66, lc[1] + Math.sin(ang) * 48]);
  }
  const lakeR = roughen(lakePts, 4, 0.25, rng(31), true);
  const ripples = 'M' + (lc[0] - 30) + ',' + (lc[1] - 4) + 'q10,-6 20,0 q10,6 20,0 M' + (lc[0] - 20) + ',' + (lc[1] + 14) + 'q8,-5 16,0 q8,5 16,0';

  const raw = [
    ['Вал Лемар', 582, 190, 'town', 'r'],
    ['Масун ларок', 425, 250, 'town', 'l'],
    ['Мал залин', 627, 258, 'town', 'r'],
    ['Зок мин лен', 558, 335, 'town', 'r'],
    ['Ма сунит Латун', 373, 390, 'town', 'r'],
    ['Бос Набун', 527, 440, 'town', 'r'],
    ['Яслабеаз', 302, 530, 'town', 'r'],
    ['Гу со Бу', 563, 533, 'bigtown', 'r'],
    ['Зам цок лен', 373, 566, 'town', 'r'],
    ['Ва со Мак', 233, 713, 'town', 'r'],
    ['Рак бо Нир', 475, 711, 'town', 'r'],
    ['Ми лер Кон', 386, 792, 'town', 'r'],
    ['Лагерь солнца', 33, 333, 'camp', 'r'],
    ['Пункт отправки', 235, 383, 'camp', 'l'],
    ['Лагерь последнего луча', 115, 410, 'camp', 'b'],
    ['Церковь Гул Лара', 157, 510, 'church', 'l'],
    ['Лагерь смертобоев', 50, 555, 'camp', 'b'],
    ['Крипта тихого шёпота', 676, 385, 'crypt', 'b'],
    ['Культ ока бури', 619, 632, 'cult', 'r'],
  ];
  const places = raw.map((q, i) => {
    const p = T(q[1], q[2]);
    return { key: `frozen-${i + 1}`, name: q[0], kind: q[3], x: r1(p[0]), y: r1(p[1]), side: q[4] };
  });
  const towns = places.filter((p) => p.kind === 'town' || p.kind === 'bigtown');
  const roads = roadsBetween(towns, 41, 280, (a) => a.kind === 'bigtown');
  places.push({ key: 'frozen-lake', name: 'Озеро ледяной змеи', kind: 'lake', x: r1(lc[0]), y: r1(lc[1]), side: 'b' });
  places.push({ key: 'frozen-eye', name: 'Око бури', kind: 'storm', x: r1(eye[0]), y: r1(eye[1]), side: 'b' });
  [
    [1098, 210],
    [1182, 333],
    [910, 353],
    [1180, 490],
    [985, 703],
    [1133, 720],
    [790, 765],
    [636, 703],
  ].forEach((q, i) => {
    const p = T(q[0], q[1]);
    places.push({ key: `frozen-vamp${i + 1}`, name: '', kind: 'vampire', x: r1(p[0]), y: r1(p[1]), side: 'r' });
  });

  const mounts = [],
    mr = rng(61);
  function massif(pts, count, sc, spread) {
    const path = roughen(pts, 4, 0.3, mr, false);
    for (let i = 0; i < count; i++) {
      const k = Math.floor(mr() * (path.length - 1)),
        a = path[k],
        b = path[k + 1],
        t = mr();
      const px = a[0] + (b[0] - a[0]) * t,
        py = a[1] + (b[1] - a[1]) * t,
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        len = Math.hypot(dx, dy) || 1;
      const g = (mr() + mr() + mr() - 1.5) / 1.5,
        x = px - (dy / len) * g * spread,
        y = py + (dx / len) * g * spread;
      if (!inside([x, y], frozenPts)) continue;
      mounts.push({ x: r1(x), y: r1(y), s: Math.round(sc * (1.15 - Math.abs(g) * 0.55) * (0.8 + mr() * 0.4) * 100) / 100 });
    }
  }
  massif(
    [
      [1240, 360],
      [1360, 330],
      [1480, 380],
    ],
    40,
    1.4,
    30,
  );
  massif(
    [
      [1300, 560],
      [1420, 520],
      [1540, 560],
    ],
    30,
    1.2,
    24,
  );
  massif(
    [
      [560, 240],
      [640, 215],
      [720, 230],
    ],
    18,
    0.95,
    14,
  );
  mounts.sort((a, b) => a.y - b.y);
  const pines = [],
    pr = rng(71);
  function grove(cx, cy, rx, ry, n) {
    for (let i = 0; i < n; i++) {
      const a = pr() * Math.PI * 2,
        d = Math.sqrt(pr()),
        x = cx + Math.cos(a) * rx * d,
        y = cy + Math.sin(a) * ry * d,
        s = 5 + pr() * 3;
      if (!inside([x, y], frozenPts)) continue;
      pines.push({
        d: 'M' + x.toFixed(1) + ',' + (y - s * 2).toFixed(1) + 'l' + (s * 0.7).toFixed(1) + ',' + (s * 2).toFixed(1) + 'h-' + (s * 1.4).toFixed(1) + 'z',
        fill: pr() < 0.5 ? '#3f5b4a' : '#4c6a57',
        y,
      });
    }
  }
  grove(470, 600, 70, 34, 50);
  grove(1250, 700, 90, 40, 60);
  grove(300, 860, 60, 28, 34);
  pines.sort((a, b) => a.y - b.y);
  pines.forEach((p) => delete p.y);
  const ice = [],
    drifts = [],
    dunes = [],
    ir = rng(81);
  for (let i = 0; i < 130; i++) {
    const x = 120 + ir() * 1400,
      y = 260 + ir() * 700;
    if (!inside([x, y], frozenPts)) continue;
    if (ir() < 0.5)
      ice.push(
        smooth(
          roughen(
            [
              [x, y],
              [x + 24, y + 5],
            ],
            3,
            0.8,
            ir,
            false,
          ),
          false,
        ),
      );
    else drifts.push('M' + (x - 12).toFixed(1) + ',' + y.toFixed(1) + 'q12,-7 24,0');
  }
  for (let j = 0; j < 30; j++) {
    const dx2 = ir() * 1600,
      dy2 = 960 + ir() * 120;
    dunes.push('M' + (dx2 - 14).toFixed(1) + ',' + dy2.toFixed(1) + 'q7,-6 14,0 q7,6 14,0');
  }

  const land = close(frozenPts);
  const beyondHalf = [[wallPts[0][0], -100]].concat(wallPts, [
    [wallPts[wallPts.length - 1][0], 1200],
    [-100, 1200],
    [-100, -100],
  ]);
  const regions = [
    {
      key: 'main',
      name: 'Замёрзшие земли',
      shape: rings(pc.difference(land, close(beyondHalf))),
      fill: null,
      edge: '#2b3d5c',
      label: { path: 'M1100 770 Q1300 728 1520 770', size: 30, spacing: 8, ink: '#2b3d5c' },
    },
    {
      key: 'beyond',
      name: 'За Заставой',
      shape: rings(pc.intersection(land, close(beyondHalf))),
      fill: null,
      edge: '#2b3d5c',
      label: { x: 190, y: 330, rotate: 0, size: 20, spacing: 5, ink: '#2b3d5c', muted: true },
    },
    {
      key: 'n-green',
      name: 'Зелёные долины',
      shape: clipCanvas(
        N.concat([
          [1660, -60],
          [-60, -60],
        ]),
      ),
      fill: '#a7c08a',
      edge: '#557040',
      label: { x: 800, y: 70, rotate: 0, size: 22, spacing: 6, ink: '#5b4a33', muted: true },
    },
    {
      key: 's-cursed',
      name: 'Проклятые земли',
      shape: clipCanvas(
        S.concat([
          [1660, 1160],
          [-60, 1160],
        ]),
      ),
      fill: '#ddc98d',
      edge: '#7d6526',
      label: { x: 800, y: 1060, rotate: 0, size: 22, spacing: 6, ink: '#5b4a33', muted: true },
    },
  ];

  const art = {
    land: poly(frozenPts),
    nLine: smooth(N, false),
    sLine: smooth(S, false),
    wall: smooth(wallPts, false),
    merlons,
    storm: smooth(stormPts, false),
    vortex,
    eye: { x: r1(eye[0]), y: r1(eye[1]) },
    lake: smooth(lakeR, true),
    ripples,
    mounts,
    pines,
    ice,
    drifts,
    dunes,
  };
  return { art, data: { id: 'frozen', title: 'Замёрзшие земли', parent: 'world', regions, places, roads } };
}

// ---------- запись ----------

const built = { world: buildWorld(), razdolye: buildRazdolye(), frozen: buildFrozen() };
const artDir = join(root, 'web/src/maps/art');
const dataDir = join(root, 'server/src/maps/data');
mkdirSync(artDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });
for (const [id, { art, data }] of Object.entries(built)) {
  const a = join(artDir, `${id}.json`),
    d = join(dataDir, `${id}.json`);
  writeFileSync(a, JSON.stringify(art) + '\n');
  writeFileSync(d, JSON.stringify(data) + '\n');
  const names = data.places.filter((p) => p.name).length;
  console.log(`${id}: регионов ${data.regions.length}, мест ${data.places.length} (с именем ${names}), дорог ${data.roads.length} → ${relative(root, a)}, ${relative(root, d)}`);
}
// Проверка: в рельефе не должно быть ни одного имени места или региона.
for (const [id, { art, data }] of Object.entries(built)) {
  const s = JSON.stringify(art);
  for (const n of [...data.regions.map((r) => r.name), ...data.places.map((p) => p.name)].filter(Boolean)) {
    if (s.includes(n)) throw new Error(`В рельефе «${id}» нашлось имя «${n}»`);
  }
}
