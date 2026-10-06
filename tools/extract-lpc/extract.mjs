// Набор деталей для фигурок из Universal LPC Spritesheet Character Generator (закреплённый коммит).
// Берёт только отобранные детали (MANIFEST ниже) и только нужные анимации, ничего не перерисовывает.
// На выходе:
//   web/public/lpc/sheets/<путь LPC>.png — листы анимаций (лениво, вне предкэша PWA);
//   web/src/figure/catalog.json         — слоты, детали, слои, анимации, способ окраски;
//   web/src/figure/palettes.json        — палитры кожи, волос, ткани, металла (ULPC);
//   web/src/figure/credits.json, web/public/lpc/CREDITS.csv — авторы и лицензии использованных файлов.
// Запуск: node tools/extract-lpc/extract.mjs  (LPC_DIR=<клон с метаданными> — чтобы не клонировать заново).
// Результат руками не править — менять MANIFEST и запускать снова.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = 'https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git';
const SHA = '58ce1aa479e4df32845a73a5d0afc221c3a893c2';
const RAW = `https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/${SHA}/spritesheets/`;

/** Анимации, которые нужны фигуркам: стоит, идёт, удар, выпад, магия, выстрел, ранен. */
const ANIMS = ['idle', 'walk', 'slash', 'thrust', 'spellcast', 'shoot', 'hurt'];
const BODIES = ['male', 'female'];

// [слот, id, файл описания (sheet_definitions/…), подпись, варианты (для деталей без палитры), доп. описания-слои (стрела у лука)]
const MANIFEST = [
  ['body', 'human', 'body/body.json', 'Человек'],
  ['body', 'skeleton', 'body/special/body_skeleton.json', 'Скелет'],
  ['body', 'zombie', 'body/special/body_zombie.json', 'Зомби', ['zombie']],

  ['head', 'human_male', 'head/heads/human/heads_human_male.json', 'Мужское'],
  ['head', 'human_female', 'head/heads/human/heads_human_female.json', 'Женское'],
  ['head', 'human_male_elderly', 'head/heads/human/heads_human_male_elderly.json', 'Старик'],
  ['head', 'human_female_elderly', 'head/heads/human/heads_human_female_elderly.json', 'Старуха'],
  ['head', 'human_male_gaunt', 'head/heads/human/heads_human_male_gaunt.json', 'Худое'],
  ['head', 'orc_male', 'head/heads/fantasy/heads_orc_male.json', 'Орк'],
  ['head', 'orc_female', 'head/heads/fantasy/heads_orc_female.json', 'Орчиха'],
  ['head', 'goblin', 'head/heads/fantasy/heads_goblin.json', 'Гоблин'],
  ['head', 'troll', 'head/heads/fantasy/heads_troll.json', 'Тролль'],
  ['head', 'skeleton', 'head/heads/undead/heads_skeleton.json', 'Череп'],
  ['head', 'zombie', 'head/heads/undead/heads_zombie.json', 'Зомби'],
  ['head', 'vampire', 'head/heads/undead/heads_vampire.json', 'Вампир'],
  ['head', 'wolf', 'head/heads/beast/heads_wolf_male.json', 'Волк'],
  ['head', 'minotaur', 'head/heads/beast/heads_minotaur.json', 'Минотавр'],

  ['hair', 'plain', 'hair/short/hair_plain.json', 'Короткие'],
  ['hair', 'messy', 'hair/short/hair_messy1.json', 'Взъерошенные'],
  ['hair', 'bangs', 'hair/short/hair_bangs.json', 'С чёлкой'],
  ['hair', 'pixie', 'hair/short/hair_pixie.json', 'Пикси'],
  ['hair', 'parted', 'hair/short/hair_parted.json', 'С пробором'],
  ['hair', 'buzzcut', 'hair/bald/hair_buzzcut.json', 'Ёжик'],
  ['hair', 'balding', 'hair/bald/hair_balding.json', 'Залысины'],
  ['hair', 'longhawk', 'hair/bald/hair_longhawk.json', 'Ирокез'],
  ['hair', 'bob', 'hair/bob/hair_bob.json', 'Каре'],
  ['hair', 'long', 'hair/long/hair_long.json', 'Длинные'],
  ['hair', 'long_straight', 'hair/long/hair_long_straight.json', 'Прямые длинные'],
  ['hair', 'wavy', 'hair/long/hair_wavy.json', 'Волнистые'],
  ['hair', 'long_messy', 'hair/long/hair_long_messy.json', 'Длинные лохматые'],
  ['hair', 'xlong', 'hair/xlong/hair_xlong.json', 'Очень длинные'],
  ['hair', 'ponytail', 'hair/braids/hair_ponytail.json', 'Хвост'],
  ['hair', 'long_tied', 'hair/braids/hair_long_tied.json', 'Низкий хвост'],
  ['hair', 'braid', 'hair/braids/hair_braid.json', 'Коса'],
  ['hair', 'topknot', 'hair/braids/hair_topknot_short.json', 'Пучок'],
  ['hair', 'curly_short', 'hair/curly/hair_curly_short.json', 'Кудри'],
  ['hair', 'curly_long', 'hair/curly/hair_curly_long.json', 'Длинные кудри'],
  ['hair', 'afro', 'hair/afro/hair_afro.json', 'Афро'],
  ['hair', 'dreadlocks', 'hair/afro/hair_dreadlocks_long.json', 'Дреды'],
  ['hair', 'spiked', 'hair/spiky/hair_spiked.json', 'Колючки'],

  ['beard', 'beard', 'hair/beards/beards_beard.json', 'Борода'],
  ['beard', 'medium', 'hair/beards/beards_medium.json', 'Окладистая'],
  ['beard', 'trimmed', 'hair/beards/beards_trimmed.json', 'Короткая'],
  ['beard', 'stubble', 'hair/beards/beards_5oclock_shadow.json', 'Щетина'],
  ['beard', 'mustache', 'hair/mustaches/beards_mustache.json', 'Усы'],
  ['beard', 'walrus', 'hair/mustaches/beards_walrus.json', 'Моржовые усы'],

  ['torso', 'longsleeve', 'torso/shirts/longsleeve/torso_clothes_longsleeve.json', 'Рубаха'],
  ['torso', 'buttoned', 'torso/shirts/longsleeve/torso_clothes_longsleeve2_buttoned.json', 'На пуговицах'],
  ['torso', 'cardigan', 'torso/shirts/longsleeve/torso_clothes_longsleeve2_cardigan.json', 'Кофта'],
  ['torso', 'shortsleeve', 'torso/shirts/shortsleeve/torso_clothes_shortsleeve.json', 'Короткий рукав'],
  ['torso', 'sleeveless', 'torso/shirts/sleeveless/torso_clothes_sleeveless1.json', 'Безрукавка'],

  ['armour', 'leather', 'torso/armour/torso_armour_leather.json', 'Кожаный доспех'],
  ['armour', 'chainmail', 'torso/torso_chainmail.json', 'Кольчуга'],
  ['armour', 'plate', 'torso/armour/torso_armour_plate.json', 'Латы'],
  ['armour', 'legion', 'torso/armour/torso_armour_legion.json', 'Легионерский'],

  ['cape', 'solid', 'torso/cape/cape_solid.json', 'Плащ'],
  ['cape', 'tattered', 'torso/cape/cape_tattered.json', 'Рваный плащ'],

  ['legs', 'pants', 'legs/pants/legs_pants.json', 'Штаны'],
  ['legs', 'pants_long', 'legs/pants/legs_pants2.json', 'Длинные штаны'],
  ['legs', 'pantaloons', 'legs/pants/legs_pantaloons.json', 'Шаровары'],
  ['legs', 'shorts', 'legs/shorts/legs_shorts.json', 'Шорты'],
  ['legs', 'skirt', 'legs/skirts/legs_skirts_plain.json', 'Юбка'],
  ['legs', 'skirt_slit', 'legs/skirts/legs_skirts_slit.json', 'Юбка с разрезом'],
  ['legs', 'hose', 'legs/leggings/legs_hose.json', 'Чулки'],
  ['legs', 'armour', 'legs/legs_armour.json', 'Латные поножи'],

  ['feet', 'boots', 'feet/boots/feet_boots_basic.json', 'Сапоги'],
  ['feet', 'boots_rim', 'feet/boots/feet_boots_rim.json', 'Сапоги с отворотом'],
  ['feet', 'shoes', 'feet/shoes/feet_shoes_basic.json', 'Башмаки'],
  ['feet', 'sandals', 'feet/feet_sandals.json', 'Сандалии'],
  ['feet', 'armour', 'feet/feet_armour.json', 'Латные сапоги'],

  ['headwear', 'hood', 'headwear/coverings/hoods/hat_hood_cloth.json', 'Капюшон'],
  ['headwear', 'bandana', 'headwear/coverings/bandana/hat_bandana.json', 'Бандана'],
  ['headwear', 'headband', 'headwear/coverings/headbands/hat_headband_thick.json', 'Повязка'],
  ['headwear', 'nasal', 'headwear/helmets/helmets/hat_helmet_nasal.json', 'Шлем с наносником'],
  ['headwear', 'barbarian', 'headwear/helmets/helmets/hat_helmet_barbarian.json', 'Варварский шлем'],
  ['headwear', 'kettle', 'headwear/helmets/helmets/hat_helmet_kettle.json', 'Капеллина'],
  ['headwear', 'horned', 'headwear/helmets/helmets/hat_helmet_horned.json', 'Рогатый шлем'],
  ['headwear', 'greathelm', 'headwear/helmets/helmets/hat_helmet_greathelm.json', 'Топфхельм'],

  ['weapon', 'longsword', 'weapons/sword/weapon_sword_longsword.json', 'Меч'],
  ['weapon', 'saber', 'weapons/sword/weapon_sword_saber.json', 'Сабля'],
  ['weapon', 'glowsword', 'weapons/sword/weapon_sword_glowsword.json', 'Светящийся меч', ['blue', 'red']],
  ['weapon', 'mace', 'weapons/blunt/weapon_blunt_mace.json', 'Булава'],
  ['weapon', 'waraxe', 'weapons/blunt/weapon_blunt_waraxe.json', 'Секира'],
  ['weapon', 'dagger', 'weapons/sword/weapon_sword_dagger.json', 'Кинжал'],
  ['weapon', 'spear', 'weapons/polearm/weapon_polearm_spear.json', 'Копьё', ['steel', 'iron', 'bronze', 'gold']],
  ['weapon', 'bow', 'weapons/ranged/bow/weapon_ranged_bow_recurve.json', 'Лук', ['medium', 'light', 'dark', 'gold'], ['weapons/ranged/bow/weapon_ranged_bow_arrow.json']],
  ['weapon', 'staff', 'weapons/magic/weapon_magic_simple.json', 'Посох'],
];
/** Чем бьёт оружие (какой анимацией атакует фигурка). Без оружия — удар рукой. */
const ATTACK = { longsword: 'slash', saber: 'slash', glowsword: 'slash', mace: 'slash', waraxe: 'slash', dagger: 'slash', spear: 'thrust', bow: 'shoot', staff: 'spellcast' };
const MATERIAL_BASE = { body: 'light', hair: 'orange', cloth: 'white', metal: 'steel' };

// ---------- метаданные LPC ----------

function lpcDir() {
  if (process.env.LPC_DIR) return process.env.LPC_DIR;
  const dir = join(tmpdir(), 'zg-lpc-meta');
  if (!existsSync(join(dir, 'sheet_definitions'))) {
    rmSync(dir, { recursive: true, force: true });
    execFileSync('git', ['clone', '-q', '--filter=blob:none', '--sparse', REPO, dir], { stdio: 'inherit' });
    execFileSync('git', ['-C', dir, 'sparse-checkout', 'set', '--no-cone', '/CREDITS.csv', '/sheet_definitions/**', '/palette_definitions/**'], { stdio: 'inherit' });
  }
  execFileSync('git', ['-C', dir, 'checkout', '-q', SHA], { stdio: 'inherit' });
  return dir;
}
const LPC = lpcDir();
const json = (p) => JSON.parse(readFileSync(join(LPC, p), 'utf8'));
const tree = new Set(
  execFileSync('git', ['-C', LPC, 'ls-tree', '-r', '--name-only', SHA, 'spritesheets'], { maxBuffer: 1 << 28 })
    .toString()
    .split('\n'),
);
const has = (rel) => tree.has(`spritesheets/${rel}`);

/** Способ окраски: палитра материала (одна картинка, перекраска на клиенте) или готовые варианты-файлы. */
function colorsOf(def, variants) {
  const rec = def.recolors?.material ? def.recolors : def.recolors?.color_1;
  if (rec?.material && MATERIAL_BASE[rec.material]) {
    const base = String(rec.base ?? MATERIAL_BASE[rec.material]).replace(/^[a-z]+\./, '');
    return { kind: 'palette', material: rec.material, base };
  }
  if (variants?.length) return { kind: 'variants', list: variants };
  if (def.variants?.length === 1) return { kind: 'variants', list: def.variants };
  return null;
}

const files = new Set();
const problems = [];
const catalog = { sha: SHA, anims: ANIMS, bodies: BODIES, slots: {} };

for (const [slot, id, defPath, label, variants, extra = []] of MANIFEST) {
  const def = json(`sheet_definitions/${defPath}`);
  const colors = colorsOf(def, variants);
  const layers = [];
  const sources = [def, ...extra.map((e) => json(`sheet_definitions/${e}`))];
  for (const [key, layer, src] of sources.flatMap((d) => Object.entries(d).map(([k, l]) => [k, l, d]))) {
    if (!key.startsWith('layer_')) continue;
    const custom = layer.custom_animation;
    if (custom && custom !== 'slash_oversize') continue; // 128-кадры (walk_128 и т. п.) не берём
    const paths = {};
    const anims = {};
    for (const body of BODIES) {
      const p = layer[body];
      if (!p) continue;
      paths[body] = p;
      const list = custom === 'slash_oversize' ? ['slash'] : ANIMS;
      for (const a of list) {
        // Файлы: палитра — <путь><анимация>.png; варианты — <путь><анимация>/<вариант>.png;
        // крупный удар (192×192) — <путь><вариант>.png (слой уже лежит в папке своей анимации).
        const V = src !== def ? (src.variants ?? []) : colors?.kind === 'variants' ? colors.list : colors?.kind === 'palette' ? [] : (def.variants ?? []);
        const rels = V.length ? V.map((v) => (custom ? `${p}${v}.png` : `${p}${a}/${v}.png`)) : [`${p}${a}.png`];
        const found = rels.filter(has);
        if (found.length) {
          anims[a] = true;
          found.forEach((f) => files.add(f));
        }
      }
    }
    if (!Object.keys(paths).length) continue;
    layers.push({ z: layer.zPos ?? 0, paths, anims: Object.keys(anims), ...(custom ? { oversize: true } : {}), ...(src !== def ? { fixed: src.variants?.[0] } : {}) });
  }
  const bodies = BODIES.filter((b) => layers.some((l) => l.paths[b]));
  const need = slot === 'weapon' ? (ATTACK[id] ?? 'slash') : 'walk';
  if (!layers.length || !layers.some((l) => l.anims.includes(need))) problems.push(`${slot}/${id}: нет анимации ${need} — пропущено`);
  else {
    (catalog.slots[slot] ??= []).push({
      id,
      label,
      bodies,
      colors,
      layers,
      ...(slot === 'weapon' ? { attack: ATTACK[id] ?? 'slash' } : {}),
    });
  }
}

// ---------- палитры ----------
const palettes = {};
for (const m of Object.keys(MATERIAL_BASE)) palettes[m] = json(`palette_definitions/${m}/${m}_ulpc.json`);

// ---------- авторы ----------
function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') ((cell += '"'), i++);
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') (row.push(cell.trim()), (cell = ''));
    else if (c === '\n') (row.push(cell.trim()), rows.push(row), (row = []), (cell = ''));
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) (row.push(cell.trim()), rows.push(row));
  return rows;
}
const csvText = readFileSync(join(LPC, 'CREDITS.csv'), 'utf8');
const csv = parseCsv(csvText);
const header = csv[0];
const credits = new Map();
const csvOut = [csvText.split('\n')[0]];
const csvLines = csvText.split('\n');
csv.slice(1).forEach((r, i) => {
  if (!files.has(r[0])) return;
  csvOut.push(csvLines[i + 1]);
  for (const a of (r[2] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const c = credits.get(a) ?? { name: a, licenses: new Set(), urls: new Set() };
    (r[3] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((l) => c.licenses.add(l));
    (r[4] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((u) => c.urls.add(u));
    credits.set(a, c);
  }
});
void header;

// ---------- загрузка ----------
const outSheets = join(root, 'web/public/lpc/sheets');
const list = [...files].sort();
let downloaded = 0,
  bytes = 0;
const queue = list.filter((f) => !existsSync(join(outSheets, f)));
async function worker() {
  while (queue.length) {
    const f = queue.shift();
    const res = await fetch(RAW + f);
    if (!res.ok) {
      problems.push(`${f}: ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(join(outSheets, f)), { recursive: true });
    writeFileSync(join(outSheets, f), buf);
    downloaded++;
    bytes += buf.length;
  }
}
await Promise.all(Array.from({ length: 12 }, worker));

const figDir = join(root, 'web/src/figure');
mkdirSync(figDir, { recursive: true });
writeFileSync(join(figDir, 'catalog.json'), JSON.stringify(catalog) + '\n');
writeFileSync(join(figDir, 'palettes.json'), JSON.stringify(palettes) + '\n');
writeFileSync(
  join(figDir, 'credits.json'),
  JSON.stringify([...credits.values()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ name: c.name, licenses: [...c.licenses].sort(), urls: [...c.urls].sort() }))) +
    '\n',
);
writeFileSync(join(root, 'web/public/lpc/CREDITS.csv'), csvOut.join('\n') + '\n');

const counts = Object.entries(catalog.slots)
  .map(([s, items]) => `${s} ${items.length}`)
  .join(', ');
console.log(`LPC ${SHA.slice(0, 8)}: ${counts}; файлов ${list.length} (скачано ${downloaded}, ${(bytes / 1048576).toFixed(1)} МБ); авторов ${credits.size}`);
console.log(`→ ${relative(root, outSheets)}, ${relative(root, figDir)}/catalog.json, palettes.json, credits.json`);
if (problems.length) console.log('Проблемы:\n  ' + problems.join('\n  '));
