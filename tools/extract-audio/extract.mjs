// Звуки стола из наборов Kenney (CC0): Casino Audio (кубики), Impact Sounds (удары, колокол), RPG Audio (книга, дверь, клинок).
// Архивы — с kenney.nl, проверка sha256: другой файл по тому же адресу — остановка, а не тихая подмена.
// Берёт только отобранные звуки (SOUNDS ниже), ничего не перезаписывает по смыслу: .ogg как есть и .m4a (AAC, ffmpeg) —
// Safari и браузеры телевизоров Vorbis декодируют не всегда.
// На выходе:
//   web/public/sfx/<звук>-<n>.ogg|.m4a — варианты звука (вне предкэша PWA, кэш при первом звуке);
//   web/src/tv/sfx.json                — звук → число вариантов, версия файлов для ?v=.
// Запуск: node tools/extract-audio/extract.mjs  (нужны unzip и ffmpeg; KENNEY_DIR=<папка с архивами> — чтобы не качать заново).
// Результат руками не править — менять SOUNDS и запускать снова.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKS = {
  casino: {
    url: 'https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip',
    sha256: 'f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18',
  },
  impact: {
    url: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
    sha256: '029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8',
  },
  rpg: {
    url: 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
    sha256: '6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b',
  },
};

// звук → [набор, файлы в Audio/] — варианты чередуются, чтобы повтор не резал слух
const SOUNDS = {
  roll: ['casino', ['die-throw-1', 'die-throw-2', 'die-throw-3', 'die-throw-4']], // кубик летит и катится
  knock: ['impact', ['impactWood_light_000', 'impactWood_light_001', 'impactWood_light_002']], // удар кубика о пол
  crit: ['impact', ['impactBell_heavy_000']], // крит — колокол
  fail: ['impact', ['impactSoft_heavy_000']], // провал — глухой удар
  swing: ['rpg', ['drawKnife1', 'drawKnife2']], // замах в бою
  hit: ['impact', ['impactPunch_heavy_000', 'impactPunch_heavy_001']], // попадание
  flinch: ['impact', ['impactPunch_medium_000']], // ответный удар
  page: ['rpg', ['bookFlip1', 'bookFlip2']], // смена сцены
  door: ['rpg', ['doorOpen_1']], // город на столе
};

async function pack(id) {
  const { url, sha256 } = PACKS[id];
  const name = url.split('/').pop();
  const local = process.env.KENNEY_DIR && join(process.env.KENNEY_DIR, name);
  const buf = local && existsSync(local) ? readFileSync(local) : Buffer.from(await (await fetch(url)).arrayBuffer());
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== sha256) throw new Error(`${name}: sha256 ${got}, ждали ${sha256}`);
  const dir = join(tmpdir(), 'zg-kenney', id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), buf);
  execFileSync('unzip', ['-q', '-o', join(dir, name), '-d', dir]);
  return join(dir, 'Audio');
}

const out = join(root, 'web/public/sfx');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const dirs = {};
for (const id of Object.keys(PACKS)) dirs[id] = await pack(id);

const counts = {};
for (const [sound, [id, files]] of Object.entries(SOUNDS)) {
  files.forEach((f, i) => {
    const src = join(dirs[id], `${f}.ogg`);
    const base = join(out, `${sound}-${i + 1}`);
    writeFileSync(`${base}.ogg`, readFileSync(src));
    // AAC 96 кбит/с моно: короткие звуки, телевизор и Safari
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-c:a', 'aac', '-b:a', '96k', `${base}.m4a`]);
  });
  counts[sound] = files.length;
}
const v = createHash('sha256')
  .update(
    Object.values(PACKS)
      .map((p) => p.sha256)
      .join() + JSON.stringify(SOUNDS),
  )
  .digest('hex')
  .slice(0, 8);
const catalog = { source: 'Kenney: Casino Audio 1.1, Impact Sounds, RPG Audio (CC0)', v, sounds: counts };
writeFileSync(join(root, 'web/src/tv/sfx.json'), JSON.stringify(catalog, null, 1) + '\n');
console.log(`звуков: ${Object.keys(counts).length}, файлов: ${Object.values(counts).reduce((a, b) => a + b, 0) * 2}, v=${v}`);
