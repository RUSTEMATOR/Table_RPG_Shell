// Наборы украшений по темам (этап 36, каталог — docs/design-packs.md, наборы — packs.mjs, источники — sources.mjs).
// Всё превращается в маски: PNG только с прозрачностью (форма), цвет даёт тема через CSS mask-image. Сканы старых книг
// и SVG обрабатываются одинаково: яркость → прозрачность (тёмное — видно), вырезка, обрезка пустых полей, уменьшение.
// Зерно (tex) — серое, нейтральное в 50 %: накладывается soft-light и на светлую, и на тёмную панель.
// На выходе:
//   web/public/art/packs/<тема>/<часть>.png|webp — маски и зерно;
//   web/src/lib/cardTheme/packs.json             — тема → части (файл, размеры), шрифт; авторы для «Авторы графики».
// Запуск: node tools/extract-art/extract.mjs [--sheet <файл.png>] [--only тема,тема]
//   ART_CACHE=<папка> — кэш скачанного (по умолчанию во временной папке); lock.json — sha256 скачанного: первый раз
//   записывается, дальше другой файл по тому же адресу — остановка, а не тихая подмена.
// Результат руками не править — менять packs.mjs и запускать снова.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SOURCES } from './sources.mjs';
import { PACKS } from './packs.mjs';

sharp.cache(false);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const OUT = join(root, 'web/public/art/packs');
const MANIFEST = join(root, 'web/src/lib/cardTheme/packs.json');
const CACHE = process.env.ART_CACHE ?? join(tmpdir(), 'zg-art');
const LOCK = join(here, 'lock.json');
const UA = 'ZelenogoryeArtTool/1.0 (+https://github.com/RUSTEMATOR/Table_RPG_Shell)';
mkdirSync(CACHE, { recursive: true });

const args = process.argv.slice(2);
const sheetOut = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : null;
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;

const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {};
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const key = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);

// ---- скачивание ----

async function download(url) {
  const file = join(CACHE, key(url));
  let buf;
  if (existsSync(file)) buf = readFileSync(file);
  else {
    for (let attempt = 1; ; attempt++) {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
      if (r.ok) {
        buf = Buffer.from(await r.arrayBuffer());
        break;
      }
      if (attempt >= 4 || (r.status !== 429 && r.status < 500)) throw new Error(`${url}: HTTP ${r.status}`);
      await new Promise((ok) => setTimeout(ok, 2000 * attempt));
    }
    writeFileSync(file, buf);
  }
  const h = sha256(buf);
  if (!lock[url]) lock[url] = h;
  else if (lock[url] !== h) throw new Error(`${url}: sha256 ${h}, ожидался ${lock[url]} — файл по адресу изменился`);
  return buf;
}

function repoDir(s) {
  const dir = join(CACHE, `repo-${key(s.repo)}-${s.sha.slice(0, 8)}`);
  if (!existsSync(join(dir, '.git'))) {
    rmSync(dir, { recursive: true, force: true });
    execFileSync('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', s.repo, dir]);
    execFileSync('git', ['-C', dir, 'checkout', '-q', s.sha]);
  }
  return dir;
}

function unzipEntry(zipBuf, url, entry) {
  const zip = join(CACHE, key(url) + '.zip');
  if (!existsSync(zip)) writeFileSync(zip, zipBuf);
  try {
    return execFileSync('unzip', ['-p', zip, entry], { maxBuffer: 1 << 30 });
  } catch {
    throw new Error(`${url}: в архиве нет ${entry}`);
  }
}

/** Источник части: строка — ключ SOURCES, объект — источник прямо в packs.mjs. */
function sourceOf(part) {
  const s = typeof part.src === 'string' ? SOURCES[part.src] : part.src;
  if (!s) throw new Error(`нет источника ${part.src}`);
  return s;
}

async function load(part) {
  const s = sourceOf(part);
  if (s.repo) return readFileSync(join(repoDir(s), part.file));
  const buf = await download(s.url);
  if (s.hero) {
    // SVG Hero Patterns лежит в JS как data:-адрес с подстановками цвета и прозрачности
    const m = /data:image\/svg\+xml,([^']+)'/.exec(buf.toString('utf8'));
    if (!m) throw new Error(`${s.url}: не найден SVG`);
    const svg = decodeURIComponent(m[1].replace(/\$\{unhex\(\s*fill\s*\)\}/g, '000000').replace(/\$\{opacity\}/g, '1'));
    return Buffer.from(svg);
  }
  const entry = part.file ?? s.zip;
  return entry ? unzipEntry(buf, s.url, entry) : buf;
}

// ---- обработка ----

/** Картинка в RGBA (SVG — с плотностью), с вырезкой: доли [x, y, w, h] (все ≤ 1) или пиксели. */
async function rgba(buf, { crop, density = 220, rotate, flop, flip } = {}) {
  let img = sharp(buf, { density, limitInputPixels: false, failOn: 'none' });
  if (rotate) img = img.rotate(rotate);
  if (flop) img = img.flop();
  if (flip) img = img.flip();
  let { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (crop) {
    const frac = crop.every((v) => v <= 1);
    const [x, y, w, h] = frac ? [crop[0] * info.width, crop[1] * info.height, crop[2] * info.width, crop[3] * info.height].map(Math.round) : crop;
    ({ data, info } = await sharp(data, { raw: info })
      .extract({ left: x, top: y, width: Math.min(w, info.width - x), height: Math.min(h, info.height - y) })
      .raw()
      .toBuffer({ resolveWithObject: true }));
  }
  return { data, width: info.width, height: info.height };
}

/**
 * Маска: прозрачность из яркости (luma: тёмное на светлом — видно; light: светлое на тёмном) или из альфа-канала (alpha).
 * lo/hi — уровни: «чернила» слабее lo — прозрачно, сильнее hi — непрозрачно (убирает пожелтевшую бумагу сканов).
 */
function toAlpha({ data, width, height }, { mode = 'luma', lo = 60, hi = 170 }) {
  const a = Buffer.alloc(width * height);
  for (let i = 0, p = 0; p < a.length; p++, i += 4) {
    const sa = data[i + 3] / 255;
    const L = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * sa + 255 * (1 - sa); // на белом
    let v;
    if (mode === 'alpha') v = data[i + 3];
    else {
      const ink = mode === 'light' ? (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * sa : 255 - L;
      v = Math.max(0, Math.min(255, ((ink - lo) * 255) / Math.max(1, hi - lo)));
    }
    a[p] = v;
  }
  return a;
}

function bbox(a, width, height) {
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (a[y * width + x] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error('маска пустая — проверить вырезку и уровни');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Маска для CSS: чёрный + прозрачность, без пустых полей, вписанная в max (px). */
async function mask(part) {
  const img = await rgba(await load(part), part);
  const a = toAlpha(img, part);
  let pipe = sharp(Buffer.alloc(img.width * img.height * 3), { raw: { width: img.width, height: img.height, channels: 3 } }).joinChannel(a, {
    raw: { width: img.width, height: img.height, channels: 1 },
  });
  if (part.trim !== false) pipe = sharp(await pipe.png().toBuffer()).extract(bbox(a, img.width, img.height));
  const [mw, mh] = part.max ?? [512, 512];
  const out = await sharp(await pipe.png().toBuffer())
    .resize({ width: mw, height: mh, fit: part.fit ?? 'inside', withoutEnlargement: part.fit !== 'fill' })
    .png({ palette: true, colours: 32, compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return { buf: out.data, w: out.info.width, h: out.info.height, ext: 'png' };
}

/** Зерно: серое, среднее 128, размах по strength; квадрат size — целиком, без вырезки, чтобы осталось бесшовным. */
async function texture(part) {
  const size = part.size ?? 512;
  let img = sharp(await load(part), { limitInputPixels: false });
  if (part.crop) {
    const m = await img.metadata();
    const [x, y, w, h] = part.crop.map((v, i) => Math.round(v * (i % 2 ? m.height : m.width)));
    img = sharp(await img.extract({ left: x, top: y, width: w, height: h }).toBuffer());
  }
  const { data, info } = await img.resize(size, size, { fit: 'cover' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  let sq = 0;
  for (const v of data) sq += (v - mean) ** 2;
  const std = Math.sqrt(sq / data.length) || 1;
  const k = ((part.strength ?? 1) * 26) / std;
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(128 + (data[i] - mean) * k)));
  const buf = await sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } })
    .webp({ quality: 78 })
    .toBuffer();
  return { buf, w: size, h: size, ext: 'webp' };
}

// ---- сборка ----

const PARTS = ['corner', 'band', 'pat', 'tex', 'mark'];

async function build(theme, pack) {
  const out = {};
  const dir = join(OUT, theme);
  mkdirSync(dir, { recursive: true });
  const used = new Set();
  for (const name of PARTS) {
    const part = pack[name];
    if (!part) continue;
    const r = name === 'tex' ? await texture(part) : await mask(name === 'pat' ? { trim: false, ...part } : part);
    const file = `${name}.${r.ext}`;
    writeFileSync(join(dir, file), r.buf);
    const v = sha256(r.buf).slice(0, 8);
    out[name] = { src: `/art/packs/${theme}/${file}?v=${v}`, w: r.w, h: r.h, ...(part.css ?? {}) };
    const s = sourceOf(part);
    used.add(s);
  }
  if (pack.font) out.font = pack.font;
  return { out, used: [...used] };
}

async function sheet(manifest, file) {
  const { THEMES } = await import('../../web/src/lib/cardTheme/engine.mjs');
  const rows = [];
  const W = 1100,
    H = 150;
  for (const [theme, p] of Object.entries(manifest)) {
    const T = THEMES[theme] ?? THEMES.other;
    const layers = [];
    const tint = async (part, color, left, top, maxW, maxH) => {
      const src = join(OUT, theme, part.src.split('?')[0].split('/').pop());
      const m = await sharp(src).resize({ width: maxW, height: maxH, fit: 'inside' }).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
      const col = await sharp({ create: { width: m.info.width, height: m.info.height, channels: 3, background: color } })
        .joinChannel(m.data, { raw: { width: m.info.width, height: m.info.height, channels: 1 } })
        .png()
        .toBuffer();
      layers.push({ input: col, left, top });
    };
    if (p.tex)
      layers.push({
        input: await sharp(join(OUT, theme, 'tex.webp'))
          .resize(1100, 150, { fit: 'cover' })
          .ensureAlpha(0.5)
          .png()
          .toBuffer(),
        left: 0,
        top: 0,
        blend: 'soft-light',
      });
    if (p.pat) await tint(p.pat, T.accent, 760, 10, 130, 130);
    if (p.corner) await tint(p.corner, T.accent2 ?? T.accent, 10, 10, 120, 120);
    if (p.band) await tint(p.band, T.accent2 ?? T.accent, 150, 60, 420, 50);
    if (p.mark) await tint(p.mark, T.accent, 900, 10, 130, 130);
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="150" y="40" font-family="Georgia" font-size="22" fill="${T.ink}">${theme} — ${T.label}${p.font ? ' · ' + p.font : ''}</text></svg>`,
    );
    layers.push({ input: label, left: 0, top: 0 });
    rows.push(
      await sharp({ create: { width: W, height: H, channels: 3, background: T.panel } })
        .composite(layers)
        .png()
        .toBuffer(),
    );
  }
  const img = sharp({ create: { width: W, height: H * rows.length, channels: 3, background: '#888' } }).composite(rows.map((input, i) => ({ input, left: 0, top: i * H })));
  await img.png().toFile(file);
  console.log(`лист: ${file}`);
}

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { packs: {}, credits: [] };
const credits = new Map((manifest.credits ?? []).map((c) => [c.page, c]));
for (const [theme, pack] of Object.entries(PACKS)) {
  if (only && !only.has(theme)) continue;
  for (const c of credits.values()) c.themes = c.themes.filter((t) => t !== theme); // набор темы собирается заново
  try {
    const { out, used } = await build(theme, pack);
    manifest.packs[theme] = out;
    for (const s of used) {
      const c = credits.get(s.page) ?? { title: s.title, author: s.author, licence: s.licence, page: s.page, themes: [] };
      if (!c.themes.includes(theme)) c.themes.push(theme);
      credits.set(s.page, c);
    }
    console.log(`${theme}: ${Object.keys(out).join(', ')}`);
  } catch (e) {
    console.error(`${theme}: ${e.message}`);
    process.exitCode = 1;
  }
}
// авторы — только у тех наборов, что есть сейчас
const live = new Set(Object.keys(PACKS));
for (const t of Object.keys(manifest.packs)) if (!live.has(t)) delete manifest.packs[t];
manifest.credits = [...credits.values()]
  .map((c) => ({ ...c, themes: c.themes.filter((t) => live.has(t)) }))
  .filter((c) => c.themes.length)
  .sort((a, b) => a.title.localeCompare(b.title));
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
writeFileSync(LOCK, JSON.stringify(Object.fromEntries(Object.entries(lock).sort()), null, 1) + '\n');
if (sheetOut) await sheet(only ? Object.fromEntries(Object.entries(manifest.packs).filter(([t]) => only.has(t))) : manifest.packs, sheetOut);
