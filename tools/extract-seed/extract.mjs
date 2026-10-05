// Переносит таблицы рандомизатора из reference/randomizer-v5.17.html в seed/*.json без правки текста.
// Куски с данными (только const-литералы) выполняются в изолированном vm, строки попадают в JSON как есть.
// Запуск: node tools/extract-seed/extract.mjs [путь к html]
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const htmlPath = process.argv[2] ?? join(root, 'reference/randomizer-v5.17.html');
const html = readFileSync(htmlPath, 'utf8');

function slice(from, to) {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`Не найден кусок «${from}» … «${to}»`);
  return html.slice(a, b);
}

const chunks = [
  slice('/* ---------- DATA ---------- */', '/* ---------- RNG ---------- */'),
  slice('const CARDS=', 'function combosFor('),
  slice('const SUMMARY_LORE=', 'function summaryOpts('),
];

// В кусках не должно быть ничего, кроме объявлений данных.
for (const c of chunks) {
  if (/^\s*(function|class|let|var|import)\b/m.test(c)) throw new Error('В куске данных есть код, а не только константы');
}

const ctx = vm.createContext(Object.create(null));
for (const c of chunks) vm.runInContext(c, ctx, { timeout: 2000 });

const TABLES = {
  sources: 'SOURCES',
  archs: 'ARCHS',
  'arch-match': 'ARCH_MATCH',
  professions: 'PROFESSIONS',
  classes: 'CLASSES',
  green: 'GREEN',
  'green-signs': 'GREEN_SIGNS',
  tiers: 'TIERS',
  'tier-keys': 'TIER_KEYS',
  cats: 'CATS',
  marks: 'MARKS',
  relation: 'RELATION',
  lang: 'LANG',
  ability: 'ABILITY',
  flaw: 'FLAW',
  old: 'OLD',
  setting: 'SETTING',
  universes: 'UNIVERSES',
  cards: 'CARDS',
  combos: 'COMBOS',
  'summary-lore': 'SUMMARY_LORE',
  'summary-prompts': 'SUMMARY_PROMPTS',
  'summary-examples': 'SUMMARY_EXAMPLES',
  'summary-tones': 'SUM_TONES',
  'summary-persons': 'SUM_PERSONS',
};

const names = Object.values(TABLES);
const all = vm.runInContext(`({${names.join(',')}})`, ctx);

const outDir = join(root, 'seed');
mkdirSync(outDir, { recursive: true });
for (const [file, name] of Object.entries(TABLES)) {
  writeFileSync(join(outDir, `${file}.json`), JSON.stringify(all[name], null, 1) + '\n');
}

const count = (o) => (Array.isArray(o) ? o.length : Object.keys(o).length);
const meta = {
  source: relative(root, htmlPath),
  sha256: createHash('sha256').update(html).digest('hex'),
  extractedAt: new Date().toISOString(),
  counts: Object.fromEntries(Object.entries(TABLES).map(([f, n]) => [f, typeof all[n] === 'string' ? all[n].length : count(all[n])])),
};
writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 1) + '\n');
console.log(meta.counts);
