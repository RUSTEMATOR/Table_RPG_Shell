// Значки из game-icons.net (CC BY 3.0) — закреплённый коммит репозитория github.com/game-icons/icons.
// Берёт только отобранные значки (ICONS ниже), ничего не перерисовывает: из SVG 512×512 — контуры значка без чёрной подложки.
// На выходе:
//   web/src/ui/icons.json — имя → контур (d) и автор; авторы со ссылками — для экрана «Авторы графики».
// Запуск: node tools/extract-icons/extract.mjs  (ICONS_DIR=<клон> — чтобы не клонировать заново).
// Результат руками не править — менять ICONS и запускать снова.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = 'https://github.com/game-icons/icons.git';
const SHA = '82d948812bfe3f269ef8f731dcdb07b08160edc4';

// Авторы из license.txt набора (CC BY 3.0: «Icons made by {author}»).
const AUTHORS = {
  lorc: { name: 'Lorc', url: 'https://lorcblog.blogspot.com' },
  delapouite: { name: 'Delapouite', url: 'https://delapouite.com' },
  sbed: { name: 'Sbed', url: 'https://opengameart.org/content/95-game-icons' },
  darkzaitzev: { name: 'DarkZaitzev', url: 'https://darkzaitzev.deviantart.com' },
};

// <папка автора>/<имя> — где значок используется, см. web/src/ui/GameIcon.tsx
const ICONS = [
  // места в городе
  'delapouite/castle',
  'delapouite/tavern-sign',
  'delapouite/shop',
  'lorc/anvil',
  'delapouite/church',
  'lorc/wax-seal',
  'lorc/fountain',
  'delapouite/medieval-gate',
  'lorc/anchor',
  'delapouite/position-marker',
  // слух, задание
  'lorc/conversation',
  'lorc/scroll-unfurled',
  // исходы бросков
  'lorc/laurel-crown',
  'delapouite/sparkles',
  'delapouite/check-mark',
  'lorc/hazard-sign',
  'sbed/cancel',
  'lorc/claw-slashes',
  'lorc/bleeding-wound',
  'lorc/skull-crack',
  'sbed/clover',
  // пустые состояния
  'lorc/quill-ink',
  'darkzaitzev/hooded-figure',
  'delapouite/rolling-dices',
];

function checkout() {
  if (process.env.ICONS_DIR) return process.env.ICONS_DIR;
  const dir = join(tmpdir(), 'zg-game-icons');
  if (!existsSync(join(dir, '.git'))) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', REPO]);
    execFileSync('git', ['-C', dir, 'fetch', '-q', '--depth', '1', 'origin', SHA], { stdio: 'inherit' });
  }
  execFileSync('git', ['-C', dir, 'checkout', '-q', SHA]);
  return dir;
}

const BACKDROP = 'M0 0h512v512H0z';
const dir = checkout();
const icons = {};
for (const ref of ICONS) {
  const [author, name] = ref.split('/');
  if (!AUTHORS[author]) throw new Error(`нет автора ${author} в AUTHORS`);
  if (icons[name]) throw new Error(`повтор имени ${name}`);
  const svg = readFileSync(join(dir, `${ref}.svg`), 'utf8');
  if (!svg.includes('viewBox="0 0 512 512"')) throw new Error(`${ref}: не 512×512`);
  const ds = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?>/g)].map((m) => m[1]).filter((d) => d !== BACKDROP);
  if (!ds.length) throw new Error(`${ref}: нет контуров`);
  icons[name] = { d: ds.join(' '), author };
}
const used = [...new Set(ICONS.map((r) => r.split('/')[0]))];
const out = { source: `game-icons/icons @ ${SHA.slice(0, 8)}`, license: 'CC BY 3.0', authors: Object.fromEntries(used.map((a) => [a, AUTHORS[a]])), icons };
writeFileSync(join(root, 'web/src/ui/icons.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`значков: ${Object.keys(icons).length}, авторов: ${used.length}`);
