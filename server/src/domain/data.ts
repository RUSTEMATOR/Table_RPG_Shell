import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SERVER_ROOT } from '../paths.ts';

// Справочники рандомизатора из seed/*.json (tools/extract-seed). Текст не меняется,
// схемы проверяют только форму. Порядок строк важен: от него зависит выбор генератора.

const SEED_DIR = join(SERVER_ROOT, '..', 'seed');
export function load<T>(file: string, schema: z.ZodType<T>): T {
  const raw: unknown = JSON.parse(readFileSync(join(SEED_DIR, `${file}.json`), 'utf8'));
  const r = schema.safeParse(raw);
  if (!r.success) throw new Error(`seed/${file}.json: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`);
  return r.data;
}

const Pair = z.tuple([z.string(), z.string()]);
const Str = z.string();
const StrList = z.array(z.string());
export const TIER_KEYS = ['cursed', 'common', 'dual', 'legend'] as const;
export type TierKey = (typeof TIER_KEYS)[number];
export type Tier = TierKey | 'fixed';
const TierRows = <T extends z.ZodTypeAny>(row: T) => z.object({ cursed: z.array(row), common: z.array(row), dual: z.array(row), legend: z.array(row) });

// Строки таблиц. Метка: имя, суть, 4 ступени, цена, крючок.
export type MarkRow = [string, string, string[], string, string];
// Прочие категории: имя, суть, как раскрыть, эволюция [, патрон для «Старого мира»].
export type TraitRow = [string, string, string, string[], ...unknown[]];
// Сеттинг и вселенные: имя, тир, суть, эволюция.
export type SettingRow = [string, string, string, string[]];
export type ClassRow = [string, string, string];
export type GreenRow = [string, string, string, string, string];

const MarkRowS = z.tuple([Str, Str, StrList, Str, Str]) as unknown as z.ZodType<MarkRow>;
const TraitRowS = z.tuple([Str, Str, Str, StrList]).rest(z.unknown()) as unknown as z.ZodType<TraitRow>;
const SettingRowS = z.tuple([Str, Str, Str, StrList]) as unknown as z.ZodType<SettingRow>;

const ProfessionS = z.object({
  label: Str,
  classes: StrList,
  local: Str,
  demand: z.number(),
  edge: Str,
  hook: Str,
});
export type Profession = z.infer<typeof ProfessionS>;

const UniverseS = z.object({ name: Str, genre: Str, traits: z.array(SettingRowS) });

const StepS = z.object({ can: Str.optional(), cost: Str.optional(), trigger: Str.optional() }).passthrough();
const ForkOptS = z.object({ title: Str.optional(), text: Str.optional(), cost: Str.optional() }).passthrough();
const CardS = z
  .object({
    truth: Str.optional(),
    signs: Str.optional(),
    overload: Str.optional(),
    reveals: StrList.optional(),
    hooks: StrList.optional(),
    ifEarly: Str.optional(),
    ifIgnored: Str.optional(),
    combos: StrList.optional(),
    steps: z.array(StepS).optional(),
    fork: z.object({ a: ForkOptS, b: ForkOptS }).partial().optional(),
    flavors: z.record(z.string(), Str).optional(),
    tierShift: z.record(z.string(), Str).optional(),
  })
  .passthrough();
export type CardEntry = z.infer<typeof CardS>;

export const SOURCES = load('sources', z.array(Pair));
export const ARCHS = load('archs', z.array(Pair));
export const ARCH_MATCH = load('arch-match', z.record(z.string(), StrList));
export const PROFESSIONS = load('professions', z.record(z.string(), ProfessionS));
export const CLASSES = load('classes', z.array(z.tuple([Str, Str, Str]))) as ClassRow[];
export const GREEN = load('green', z.array(z.tuple([Str, Str, Str, Str, Str]))) as GreenRow[];
export const GREEN_SIGNS = load('green-signs', Str);
export const TIERS = load('tiers', z.record(z.string(), Str)) as Record<TierKey, string>;
export const CATS = load('cats', z.array(Pair)) as [CatKey, string][];
export const MARKS = load('marks', TierRows(MarkRowS)) as Record<TierKey, MarkRow[]>;
const RELATION = load('relation', TierRows(TraitRowS)) as Record<TierKey, TraitRow[]>;
const LANG = load('lang', TierRows(TraitRowS)) as Record<TierKey, TraitRow[]>;
const ABILITY = load('ability', TierRows(TraitRowS)) as Record<TierKey, TraitRow[]>;
const FLAW = load('flaw', TierRows(TraitRowS)) as Record<TierKey, TraitRow[]>;
const OLD = load('old', TierRows(TraitRowS)) as Record<TierKey, TraitRow[]>;
export const SETTING = load('setting', z.record(z.string(), z.array(SettingRowS)));
export const UNIVERSES = load('universes', z.record(z.string(), UniverseS));
export const CARDS = load('cards', z.record(z.string(), CardS));
export const COMBOS = load('combos', z.array(z.object({ a: Str, b: Str, text: Str })));
export const SUMMARY_LORE = load('summary-lore', Str);

export type CatKey = 'mark' | 'relation' | 'lang' | 'ability' | 'flaw' | 'old';
export type TraitCat = 'class' | 'green' | CatKey | 'setting';
export const CAT_DATA: Record<CatKey, Record<TierKey, (MarkRow | TraitRow)[]>> = {
  mark: MARKS,
  relation: RELATION,
  lang: LANG,
  ability: ABILITY,
  flaw: FLAW,
  old: OLD,
};

if (TIER_KEYS.some((k) => !(k in TIERS))) throw new Error('seed/tiers.json: не хватает тира');
