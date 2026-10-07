// Существа для фигурок противников (этап 33): «[LPC] Monsters» с OpenGameArt — монстры базового набора LPC
// (Charles Sanchez / CharlesGabriel, летучая мышь — bagzie) с анимациями атаки от bluecarrot16. CC-BY-SA 3.0 / GPL 3.0, мышь — ещё OGA-BY 3.0.
// Отдельно от extract.mjs: детали людей (ULPC) не пересобираются заодно.
// Листы копируются как есть. Ряды — как у LPC: вверх, влево, вниз, вправо; столбцы — кадры. Раскладки в наборе не описаны,
// кадры ниже подобраны по самим листам: сначала движение базового набора, следом кадры атаки.
// На выходе:
//   web/public/lpc/creatures/<id>.png  — листы (вне предкэша PWA, как остальные /lpc/);
//   web/src/figure/creatures.json      — существо → лист, размер кадра, кадры по анимациям, подпись; авторы и лицензии.
// Запуск: node tools/extract-lpc/creatures.mjs  (LPC_MONSTERS_ZIP=<архив> — чтобы не качать заново).
// Результат руками не править — менять CREATURES и запускать снова.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const URL = 'https://opengameart.org/sites/default/files/lpc-monsters.zip';
const SHA256 = '2c591d0e0c89dd579f84fb10ac9b24b97836941d6881abb5db85dc257892878f';

// id: [файл, подпись, кадр px, { idle, walk, attack, hurt } — номера столбцов, ranged — бьёт издали (не подходит в бою), fps — свои скорости]
const CREATURES = {
  bat: ['bat', 'Летучая мышь', 64, { idle: [1, 2, 3, 4], walk: [1, 2, 3, 4], attack: [5, 6], hurt: [0] }, { fps: { idle: 10 } }],
  bee: ['bee', 'Пчела', 32, { idle: [0, 1, 2, 3], walk: [0, 1, 2, 3], attack: [4, 5], hurt: [0] }, { fps: { idle: 10 } }],
  snake: ['snake', 'Змея', 64, { idle: [0, 1, 2, 3], walk: [0, 1, 2, 3], attack: [4, 5], hurt: [5] }, {}],
  slime: ['slime', 'Слизень', 64, { idle: [0, 1, 2, 1], walk: [0, 1, 2, 3], attack: [3, 4, 5], hurt: [3] }, {}],
  ghost: ['ghost', 'Призрак', 64, { idle: [0, 1, 2, 1], walk: [0, 1, 2, 1], attack: [4, 5], hurt: [3] }, {}],
  eyeball: ['eyeball', 'Глаз', 64, { idle: [0, 1, 2, 3], walk: [0, 1, 2, 3], attack: [4, 5], hurt: [0] }, { ranged: true }],
  small_worm: ['small_worm', 'Червь', 64, { idle: [0, 1, 2, 1], walk: [0, 1, 2, 1], attack: [3, 4], hurt: [5] }, {}],
  big_worm: ['big_worm', 'Большой червь', 64, { idle: [0, 1, 2, 3], walk: [0, 1, 2, 3], attack: [4, 5], hurt: [0] }, { ranged: true }],
  pumpking: ['pumpking', 'Тыквенный король', 64, { idle: [0, 1, 2, 1], walk: [0, 1, 2, 1], attack: [3, 4, 5], hurt: [0] }, { ranged: true }],
  man_eater_flower: ['man_eater_flower', 'Цветок-людоед', 128, { idle: [0, 1, 2, 3], walk: [0, 1, 2, 3], attack: [4, 5], hurt: [0] }, {}],
};

const CREDITS = [
  { name: 'Charles Sanchez (CharlesGabriel)', licenses: ['CC-BY-SA 3.0', 'GPL 3.0'], urls: ['https://opengameart.org/content/lpc-monsters'] },
  { name: 'bagzie', licenses: ['CC-BY-SA 3.0', 'GPL 3.0', 'OGA-BY 3.0'], urls: ['https://opengameart.org/content/lpc-monsters'] },
  { name: 'bluecarrot16', licenses: ['CC-BY-SA 3.0', 'GPL 3.0'], urls: ['https://opengameart.org/content/lpc-monsters'] },
];

const local = process.env.LPC_MONSTERS_ZIP;
const buf = local && existsSync(local) ? readFileSync(local) : Buffer.from(await (await fetch(URL)).arrayBuffer());
const got = createHash('sha256').update(buf).digest('hex');
if (got !== SHA256) throw new Error(`lpc-monsters.zip: sha256 ${got}, ждали ${SHA256}`);
const tmp = join(tmpdir(), 'zg-lpc-monsters');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'lpc-monsters.zip'), buf);
execFileSync('unzip', ['-q', '-o', join(tmp, 'lpc-monsters.zip'), '-d', tmp]);

const out = join(root, 'web/public/lpc/creatures');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const list = [];
for (const [id, [file, label, cell, frames, opt]] of Object.entries(CREATURES)) {
  const png = readFileSync(join(tmp, 'lpc-monsters', `${file}.png`));
  // размер листа — из заголовка PNG: проверка, что кадры не выходят за лист
  const w = png.readUInt32BE(16),
    h = png.readUInt32BE(20);
  if (h !== cell * 4) throw new Error(`${file}: высота ${h}, ждали 4 ряда по ${cell}`);
  const cols = w / cell;
  for (const [anim, fs] of Object.entries(frames)) if (fs.some((f) => f >= cols)) throw new Error(`${file}: ${anim} — кадр за краем (${cols} столбцов)`);
  writeFileSync(join(out, `${id}.png`), png);
  list.push({ id, label, cell, frames, ...(opt.ranged ? { ranged: true } : {}), ...(opt.fps ? { fps: opt.fps } : {}) });
}
const v = createHash('sha256')
  .update(SHA256 + JSON.stringify(CREATURES))
  .digest('hex')
  .slice(0, 8);
const catalog = { source: `[LPC] Monsters (OpenGameArt) ${SHA256.slice(0, 8)}`, v, creatures: list, credits: CREDITS };
writeFileSync(join(root, 'web/src/figure/creatures.json'), JSON.stringify(catalog, null, 1) + '\n');
console.log(`существ: ${list.length}, v=${v}`);
