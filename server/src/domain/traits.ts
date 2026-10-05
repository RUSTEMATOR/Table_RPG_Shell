import {
  CATS,
  CAT_DATA,
  CLASSES,
  GREEN,
  SETTING,
  SOURCES,
  TIER_KEYS,
  UNIVERSES,
  type ClassRow,
  type GreenRow,
  type MarkRow,
  type SettingRow,
  type Tier,
  type TraitCat,
  type TraitRow,
} from './data.ts';

// Индекс черт — построчный перенос «TRAIT INDEX (§1.7)» из рандомизатора.
// id = cat:slug(name). Порядок добавления совпадает с артефактом: от него зависят пулы.

export type AnyRow = ClassRow | GreenRow | MarkRow | TraitRow | SettingRow;

export interface Trait {
  id: string;
  cat: TraitCat;
  tier: Tier;
  kind: 'class' | 'green' | 'mark' | 'trait';
  name: string;
  row: AnyRow;
  src?: string;
  genre?: string;
  universe?: string;
}

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slug(s: string): string {
  const t = String(s)
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => CYR[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return t || 'x';
}

export const CAT_LABELS: Record<string, string> = Object.assign(
  { class: 'Скрытый класс', green: 'Зелёная склонность', setting: 'Сеттинговый трейт' },
  Object.fromEntries(CATS),
);

export const TRAITS: Record<string, Trait> = {};
export const TRAIT_LIST: Trait[] = [];
export const ROW2T = new Map<AnyRow, Trait>();
export const TRAITS_BY_CAT: Partial<Record<TraitCat, Trait[]>> = {};

function addTrait(cat: TraitCat, tier: Tier, kind: Trait['kind'], name: string, row: AnyRow, extra?: Partial<Trait>): Trait {
  const base = `${cat}:${slug(name)}`;
  let id = base;
  let n = 2;
  while (TRAITS[id]) id = `${base}-${n++}`;
  const t: Trait = Object.assign({ id, cat, tier, kind, name, row }, extra);
  TRAITS[id] = t;
  TRAIT_LIST.push(t);
  ROW2T.set(row, t);
  (TRAITS_BY_CAT[cat] ??= []).push(t);
  return t;
}

CLASSES.forEach((r) => addTrait('class', 'fixed', 'class', r[0], r));
GREEN.forEach((r) => addTrait('green', 'fixed', 'green', r[0], r));
for (const [cat] of CATS)
  for (const tier of TIER_KEYS)
    for (const r of CAT_DATA[cat][tier]) addTrait(cat, tier, cat === 'mark' ? 'mark' : 'trait', r[0], r);
for (const [key, rows] of Object.entries(SETTING)) {
  const lbl = SOURCES.find((s) => s[0] === key)?.[1] ?? key;
  for (const r of rows) addTrait('setting', r[1] as Tier, 'trait', r[0], r, { src: lbl, genre: key });
}
for (const [key, u] of Object.entries(UNIVERSES))
  for (const r of u.traits) addTrait('setting', r[1] as Tier, 'trait', r[0], r, { src: u.name, universe: key });

export function traitOf(id: string | undefined): Trait | undefined {
  return id ? TRAITS[id] : undefined;
}

/** Суть черты, как в traitDesc(). */
export function traitDesc(t: Trait): string {
  return String(t.cat === 'setting' ? t.row[2] : t.row[1]);
}
