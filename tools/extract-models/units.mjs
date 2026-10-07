// 3D-противники для 3D-карты (этап 34): KayKit Character Pack Adventures 1.0 и Skeletons 1.0 (Kay Lousberg, CC0) — закреплённые коммиты.
// У всех девяти моделей одна и та же оснастка (41 кость), но каждая модель — свой файл: качается, только когда её противник на карте.
// Из каждой модели остаётся: тело, один комплект снаряжения (в наборе к руке прицеплены все варианты оружия и щитов) и две анимации —
// «стоит» (Idle) и «идёт» (Walking_A); остальные ~75–95 анимаций (почти весь вес файла) убираются. Квантование и сжатие meshopt,
// как у world.glb (клиент распаковывает MeshoptDecoder из three; у скинов quantize правит inverseBindMatrices).
// Оружие скелетов в наборе — отдельными файлами без привязки к руке; без проверки глазом не цепляем — скелеты пока без оружия.
// На выходе:
//   web/public/models/units/<id>.glb — модели (вне предкэша PWA, кэш zg-models, версия — в ?v=);
//   web/src/maps3d/units.json         — id → подпись; версия файлов.
// Запуск: node tools/extract-models/units.mjs  (KAYKIT_ADV_DIR / KAYKIT_SKEL_DIR=<клон> — чтобы не клонировать заново).
// Результат руками не править — менять UNITS и запускать снова.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PACKS = {
  adv: {
    repo: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0.git',
    sha: '672074b73ba276876a19e8816ecdc5241817ab47',
    dir: 'addons/kaykit_character_pack_adventures/Characters/gltf',
    env: 'KAYKIT_ADV_DIR',
  },
  skel: {
    repo: 'https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0.git',
    sha: '15b62b9bad122f72926c10fb14d622c73819fa54',
    dir: 'addons/kaykit_character_pack_skeletons/Characters/gltf',
    env: 'KAYKIT_SKEL_DIR',
  },
};
const ANIMS = ['Idle', 'Walking_A'];

// id: [набор, файл, подпись, снаряжение — имена узлов без скина, которые остаются (остальные без скина убираются)]
const UNITS = {
  knight: ['adv', 'Knight', 'Рыцарь', ['1H_Sword', 'Rectangle_Shield', 'Knight_Helmet', 'Knight_Cape']],
  barbarian: ['adv', 'Barbarian', 'Варвар', ['1H_Axe', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape']],
  mage: ['adv', 'Mage', 'Маг', ['2H_Staff', 'Mage_Hat', 'Mage_Cape']],
  rogue: ['adv', 'Rogue', 'Разбойник', ['Knife', 'Knife_Offhand', 'Rogue_Cape']],
  rogue_hooded: ['adv', 'Rogue_Hooded', 'Разбойник в капюшоне', ['1H_Crossbow', 'Rogue_Cape']],
  skeleton_warrior: ['skel', 'Skeleton_Warrior', 'Скелет-воин', ['Skeleton_Warrior_Helmet']],
  skeleton_mage: ['skel', 'Skeleton_Mage', 'Скелет-маг', ['Skeleton_Mage_Hat']],
  skeleton_rogue: ['skel', 'Skeleton_Rogue', 'Скелет-разбойник', ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape']],
  skeleton_minion: ['skel', 'Skeleton_Minion', 'Скелет', []],
};

function checkout(p) {
  if (process.env[p.env]) return process.env[p.env];
  const dir = join(tmpdir(), `kaykit-${p.sha.slice(0, 8)}`);
  if (!existsSync(join(dir, '.git'))) {
    rmSync(dir, { recursive: true, force: true });
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', p.repo]);
    execFileSync('git', ['-C', dir, 'fetch', '-q', '--depth', '1', 'origin', p.sha], { stdio: 'inherit' });
    execFileSync('git', ['-C', dir, 'checkout', '-q', 'FETCH_HEAD']);
  }
  return dir;
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const dirs = Object.fromEntries(Object.entries(PACKS).map(([k, p]) => [k, join(checkout(p), p.dir)]));
const out = join(root, 'web/public/models/units');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const units = {};
for (const [id, [pack, file, label, gear]] of Object.entries(UNITS)) {
  const doc = await io.read(join(dirs[pack], `${file}.glb`));
  const r = doc.getRoot();
  // лишние анимации: у анимации отдельно убрать каналы и семплеры — иначе их ключи остаются в файле
  for (const a of r.listAnimations()) {
    if (ANIMS.includes(a.getName())) continue;
    a.listChannels().forEach((c) => c.dispose());
    a.listSamplers().forEach((s) => s.dispose());
    a.dispose();
  }
  const names = r.listAnimations().map((a) => a.getName());
  for (const want of ANIMS) if (!names.includes(want)) throw new Error(`${file}: нет анимации ${want}`);
  // снаряжение: узлы с сеткой без скина (оружие, щиты, шлемы, плащи) — только из списка
  const loose = r.listNodes().filter((n) => n.getMesh() && !n.getSkin());
  for (const g of gear) if (!loose.some((n) => n.getName() === g)) throw new Error(`${file}: нет узла ${g}`);
  for (const n of loose) if (!gear.includes(n.getName())) n.dispose();
  await doc.transform(dedup(), resample(), prune(), weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const glb = await io.writeBinary(doc);
  writeFileSync(join(out, `${id}.glb`), glb);
  units[id] = label;
  console.log(`${id}: ${(glb.byteLength / 1024).toFixed(0)} КБ`);
}
const v = createHash('sha256')
  .update(PACKS.adv.sha + PACKS.skel.sha + JSON.stringify(UNITS) + ANIMS.join())
  .digest('hex')
  .slice(0, 8);
writeFileSync(
  join(root, 'web/src/maps3d/units.json'),
  JSON.stringify({ source: 'KayKit Character Pack Adventures 1.0 + Skeletons 1.0 (CC0)', v, anims: { idle: 'Idle', walk: 'Walking_A' }, units }, null, 1) + '\n',
);
console.log(`моделей: ${Object.keys(units).length}, v=${v}`);
