import { z } from 'zod';
import { SHEET_KINDS, type SheetKind } from './constants.ts';

// ---- Что видит игрок: единственный формат, белый список, strictObject на всех уровнях ----

/** Вселенная и жанр источника: по ним клиент выбирает оформление (themeFor в артефакте). */
export const PlayerLookSchema = z.strictObject({ theme: z.string(), universe: z.string(), genre: z.string() });

export const PlayerTraitSchema = z.strictObject({
  cat: z.string(),
  /** Ключ категории для значка (class, green, mark, …, setting). */
  catKey: z.string(),
  /** Только у сеттинговых черт: откуда черта, для цвета её значка. */
  setting: z.strictObject({ universe: z.string(), genre: z.string() }).optional(),
  name: z.string(),
  d: z.string(),
  stagesShown: z.array(z.string()),
  price: z.string().optional(),
  hint: z.string().optional(),
});

/** Запись листа у игрока: только видимые. id — у снаряжения (игрок его правит). */
export const PlayerItemSchema = z.strictObject({ id: z.string(), title: z.string(), text: z.string() });
export const PlayerSheetNoteSchema = z.strictObject({ title: z.string(), text: z.string() });
export type PlayerItem = z.infer<typeof PlayerItemSchema>;
export type PlayerSheetNote = z.infer<typeof PlayerSheetNoteSchema>;

export const PlayerCharacterSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(['popadanets', 'local']),
  name: z.string(),
  pronoun: z.string(),
  origin: z.string(),
  look: PlayerLookSchema,
  /** Адрес портрета с версией; портрет отдаётся владельцу и мастеру. */
  portrait: z.string().optional(),
  bio: z.string().optional(),
  powerBand: z.string().optional(),
  profession: z.strictObject({ label: z.string(), local: z.string(), demand: z.number().int().min(0).max(3), edge: z.string() }).optional(),
  summary: z.string().optional(),
  crossing: z.string().optional(),
  traits: z.array(PlayerTraitSchema),
  /** Подсказки к нераскрытым чертам: только текст, без названия и категории. */
  hints: z.array(z.string()),
  items: z.array(PlayerItemSchema),
  conditions: z.array(PlayerSheetNoteSchema),
  relations: z.array(PlayerSheetNoteSchema),
});
export type PlayerCharacter = z.infer<typeof PlayerCharacterSchema>;
export type PlayerTrait = z.infer<typeof PlayerTraitSchema>;

export const PlayerCharacterResponseSchema = z.strictObject({ character: PlayerCharacterSchema.nullable() });

// ---- Запросы мастера ----

export const RollParamsSchema = z.strictObject({
  seed: z.string().trim().max(64).default(''),
  name: z.string().trim().max(120).default(''),
  pronoun: z.enum(['', 'он', 'она', 'они']).default(''),
  source: z.string().max(40),
  universe: z.string().max(40).default(''),
  arch: z.string().max(40),
  patron: z.boolean().default(false),
  profession: z.string().max(40).default(''),
  professionText: z.string().max(80).default(''),
});
export type RollParamsInput = z.input<typeof RollParamsSchema>;

export const RevealPatchSchema = z.strictObject({
  trait: z.boolean().optional(),
  stages: z.number().int().min(0).max(4).optional(),
  price: z.boolean().optional(),
  hint: z.string().max(300).optional(),
});

export const TraitTargetSchema = z.strictObject({ characterId: z.string().min(1).max(64), slot: z.number().int().min(0).max(9) });

export const SetRevealSchema = TraitTargetSchema.extend({ patch: RevealPatchSchema });
export const SetStageSchema = TraitTargetSchema.extend({ stage: z.number().int().min(0).max(4) });
export const SetTierSchema = TraitTargetSchema.extend({
  tier: z.enum(['cursed', 'common', 'dual', 'legend', 'fixed']),
  reason: z.string().max(200).default(''),
});
export const SetForkSchema = TraitTargetSchema.extend({ fork: z.enum(['a', 'b']) });

export const GmAckSchema = z.strictObject({ ok: z.boolean(), error: z.string().optional() });
export type GmAck = z.infer<typeof GmAckSchema>;

// ---- Что видит мастер (формы ответов, без strict: это мастерские данные) ----

export interface CatalogEntry {
  key: string;
  label: string;
}

export interface Catalog {
  sources: CatalogEntry[];
  archs: CatalogEntry[];
  universes: (CatalogEntry & { genre: string })[];
  professions: CatalogEntry[];
  profArchs: string[];
  tiers: CatalogEntry[];
  stageNames: string[];
}

export interface GmStep {
  name: string;
  can: string;
  cost: string;
  trigger: string;
}

export interface GmLayersView {
  truth: string;
  signs: string;
  reveals: string[];
  hooks: string[];
  ifEarly: string;
  ifIgnored: string;
  combos: string[];
  overload: string;
  flavor: string;
  flavorSrc: string;
  tierShift: string;
  tierLabel: string;
  trigger: string;
  triggerLabel: string;
  personal?: boolean;
}

export interface GmSlotView {
  index: number;
  traitId: string;
  cat: string;
  catLabel: string;
  kind: string;
  tier: string;
  tierLabel: string;
  name: string;
  d: string;
  details: { label: string; text: string }[];
  price?: string;
  hook?: string;
  steps: GmStep[];
  stage: number;
  stageName: string;
  fork: 'a' | 'b' | null;
  forkOptions: { a: { title: string; text: string; cost: string }; b: { title: string; text: string; cost: string } } | null;
  revealed: { trait: boolean; stages: number; price: boolean; hint: string };
  revealLevel: 'hidden' | 'hinted' | 'revealed';
  matched: boolean;
  manual: boolean;
  extra: boolean;
  random: boolean;
  replaced: string;
  affinityNote: string;
  stagePowerHint: string;
  gm: GmLayersView | null;
  history: { t: number; ev: string; from: number | string | null; to: number | string | null; reason?: string }[];
}

export interface GmCraftView {
  label: string;
  local: string;
  demand: number;
  edge: string;
  hook: string;
}

export interface GmDraftView {
  draft: unknown;
  slots: GmSlotView[];
  craft: GmCraftView | null;
  combos: { names: [string, string]; text: string }[];
}

export interface GmCharacterListItem {
  id: string;
  kind: 'popadanets' | 'local';
  name: string;
  ownerName: string | null;
  slots: number;
  revealed: number;
  hinted: number;
  updatedAt: number;
}

export interface GmCharacterView {
  id: string;
  kind: 'popadanets' | 'local';
  name: string;
  ownerMemberId: string | null;
  publicBio: string;
  notes: string;
  pronoun: string;
  origin: string;
  archLabel: string;
  patron: boolean;
  seed: string;
  craft: GmCraftView | null;
  power: { value: number; band: string; show: boolean };
  slots: GmSlotView[];
  combos: { names: [string, string]; text: string }[];
  greenSigns: string;
  player: PlayerCharacter;
  summaries: import('./gm.ts').GmSummary[];
  sheet: GmSheetEntry[];
}

// ---- Лист персонажа ----

export interface GmSheetEntry {
  id: string;
  kind: SheetKind;
  title: string;
  text: string;
  textGm: string;
  visible: boolean;
  byPlayer: boolean;
  updatedAt: number;
}

/** Мастер: любая запись листа. */
export const SheetWriteSchema = z.strictObject({
  kind: z.enum(SHEET_KINDS),
  title: z.string().trim().min(1).max(120),
  text: z.string().max(2000).default(''),
  textGm: z.string().max(4000).default(''),
  visible: z.boolean().default(true),
});

/** Игрок: только своё снаряжение, без видимости и заметок мастера. */
export const ItemWriteSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  text: z.string().max(2000).default(''),
});
