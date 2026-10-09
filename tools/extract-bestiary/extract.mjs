// Бестиарий D&D 5e SRD 5.1 (CC-BY-4.0, Wizards of the Coast) через Open5e API → seed/bestiary-srd.json.
// Запуск: node tools/extract-bestiary/extract.mjs [--raw <каталог>]. Сырые страницы API складываются в каталог
// (по умолчанию ./raw рядом со скриптом; каталог не коммитится), затем обрезаются до того, что нужно мастеру:
// имя, вид, размер, мировоззрение, CR, КД, хиты, скорость, характеристики, особенности и действия коротко.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rawDir = process.argv.includes('--raw') ? process.argv[process.argv.indexOf('--raw') + 1] : join(here, 'raw');
const out = join(here, '..', '..', 'seed', 'bestiary-srd.json');
const UA = 'ZelenogoryeArtTool/1.0 (+https://github.com/RUSTEMATOR/Table_RPG_Shell)';
mkdirSync(rawDir, { recursive: true });

async function page(n) {
  const f = join(rawDir, `monsters-${n}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  const url = `https://api.open5e.com/v1/monsters/?document__slug=wotc-srd&limit=100&page=${n}`;
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const j = await r.json();
  writeFileSync(f, JSON.stringify(j));
  return j;
}

const cut = (t, n) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const list = (arr, n) =>
  Array.isArray(arr)
    ? arr
        .slice(0, n)
        .map((a) => ({ name: cut(a.name, 80), desc: cut(a.desc, 320) }))
        .filter((a) => a.name)
    : [];

const monsters = [];
for (let n = 1; n <= 10; n++) {
  const j = await page(n);
  for (const m of j.results) {
    monsters.push({
      slug: m.slug,
      name: m.name,
      size: m.size ?? '',
      type: m.type ?? '',
      subtype: m.subtype ?? '',
      alignment: m.alignment ?? '',
      cr: String(m.challenge_rating ?? ''),
      crNum: Number(m.cr ?? 0),
      ac: Number(m.armor_class ?? 0),
      hp: Number(m.hit_points ?? 0),
      speed: Object.entries(m.speed ?? {})
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
      stats: [m.strength, m.dexterity, m.constitution, m.intelligence, m.wisdom, m.charisma].map((x) => Number(x ?? 10)),
      senses: cut(m.senses, 160),
      languages: cut(m.languages, 160),
      abilities: list(m.special_abilities, 6),
      actions: list(m.actions, 6),
      legendary: Array.isArray(m.legendary_actions) && m.legendary_actions.length > 0,
    });
  }
  if (!j.next) break;
}
monsters.sort((a, b) => a.name.localeCompare(b.name));
const doc = {
  source: 'D&D 5e System Reference Document 5.1 (Wizards of the Coast), via Open5e API',
  license: 'CC-BY-4.0 — https://creativecommons.org/licenses/by/4.0/legalcode',
  attribution:
    'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License.',
  extractedAt: new Date().toISOString().slice(0, 10),
  monsters,
};
writeFileSync(out, JSON.stringify(doc, null, 1));
console.log(`seed/bestiary-srd.json: ${monsters.length} чудищ`);
