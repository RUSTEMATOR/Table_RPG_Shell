import { z } from 'zod';
import { MAP_H, MAP_IDS, MAP_W, PLACE_KINDS, RUMOR_KINDS, SPOT_KINDS, type MapId, type RumorKind, type SpotKind } from './constants.ts';
import { FigureSchema, type Figure } from './figure.ts';

// ---- Карты мира (этап 21) ----
// Координаты — в единицах карты 1600×1100 (как в макетах). Рельеф — в клиенте (web/src/maps/art), всё остальное — отсюда.

export const MapIdSchema = z.enum(MAP_IDS);

export const PlaceKindSchema = z.enum(PLACE_KINDS);

const Num = z.number().finite();
const Pt = z.tuple([Num, Num]);
const Shape = z.array(z.array(Pt));
export const SideSchema = z.enum(['l', 'r', 'b']);

/** Подпись региона: по дуге (path) или прямо (x, y, rotate). */
export const RegionLabelSchema = z.strictObject({
  path: z.string().optional(),
  x: Num.optional(),
  y: Num.optional(),
  rotate: Num.optional(),
  size: Num,
  spacing: Num.optional(),
  ink: z.string(),
  muted: z.boolean().optional(),
  italic: z.boolean().optional(),
});
export type RegionLabel = z.infer<typeof RegionLabelSchema>;

/** Открытый регион, как его видят игрок и стол. */
export const MapRegionPublicSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  shape: Shape,
  fill: z.string().nullable(),
  edge: z.string(),
  border: z.boolean(),
  link: MapIdSchema.nullable(),
  label: RegionLabelSchema,
  extra: z.array(z.strictObject({ shape: Shape, fill: z.string() })),
});
export type MapRegionPublic = z.infer<typeof MapRegionPublicSchema>;

export const MapPlacePublicSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  kind: PlaceKindSchema,
  x: Num,
  y: Num,
  side: SideSchema,
  subtitle: z.string(),
  ink: z.string().nullable(),
});
export type MapPlacePublic = z.infer<typeof MapPlacePublicSchema>;

export const MapNoteSchema = z.strictObject({ id: z.string(), x: Num, y: Num, text: z.string(), updatedAt: z.number() });
export type MapNote = z.infer<typeof MapNoteSchema>;

/**
 * Фигурка на карте (этап 24): имя и внешность персонажа или противника, без ссылок на них.
 * mine — фигурка персонажа этого игрока (у стола всегда false). figure null — фигурки нет, рисуется жетон с буквой.
 */
export const TokenKindSchema = z.enum(['pc', 'npc']);
/** 3D-модель противника на 3D-карте (этап 34): список — как в web/src/maps3d/units.json (tools/extract-models/units.mjs). */
export const UNIT_IDS = ['knight', 'barbarian', 'mage', 'rogue', 'rogue_hooded', 'skeleton_warrior', 'skeleton_mage', 'skeleton_rogue', 'skeleton_minion'] as const;
export type UnitId = (typeof UNIT_IDS)[number];
export const UnitIdSchema = z.enum(UNIT_IDS);

export const MapTokenPublicSchema = z.strictObject({
  id: z.string(),
  kind: TokenKindSchema,
  name: z.string(),
  figure: FigureSchema.nullable(),
  /** 3D-модель (только у противника, если мастер выбрал) — внешность, как и фигурка */
  model: UnitIdSchema.nullable(),
  x: Num,
  y: Num,
  mine: z.boolean(),
});
export type MapTokenPublic = z.infer<typeof MapTokenPublicSchema>;

/** Поход отряда: путь (точки карты), длительность анимации в мс, номер похода (меняется с каждым походом). */
export const PartyMoveSchema = z.strictObject({ path: z.array(Pt).max(2000), ms: z.number().int().min(0).max(30000), seq: z.number().int() });
export type PartyMove = z.infer<typeof PartyMoveSchema>;

/** Фигурка в отряде на карте: персонаж игрока — имя и внешность (как у фигурок на карте), без id. */
export const PartyFigureSchema = z.strictObject({ name: z.string(), figure: FigureSchema });
export type PartyFigure = z.infer<typeof PartyFigureSchema>;

/** Карта для игрока и стола: только открытое. notes — личные заметки игрока (столу — пусто). */
export const MapPublicSchema = z.strictObject({
  id: MapIdSchema,
  title: z.string(),
  parent: MapIdSchema.nullable(),
  regions: z.array(MapRegionPublicSchema),
  places: z.array(MapPlacePublicSchema),
  /** открытые дороги: путь и концы (id открытых мест) — для маршрута (этап 28) */
  roads: z.array(z.strictObject({ d: z.string(), a: z.string(), b: z.string() })),
  /** отряд; move — последний поход по дороге (этап 28): путь, длительность анимации, отметка похода (не время) */
  party: z.strictObject({ x: Num, y: Num, move: PartyMoveSchema.nullable(), figures: z.array(PartyFigureSchema).max(12) }).nullable(),
  tokens: z.array(MapTokenPublicSchema),
  notes: z.array(MapNoteSchema),
});
export type MapPublic = z.infer<typeof MapPublicSchema>;

/** Наезд камеры на столе: точка и масштаб (1 — вся карта); place — экран этого города (этап 27); look — 3D на столе (как у мастера). */
export const MapFocusSchema = z.strictObject({ x: Num, y: Num, zoom: z.number().min(1).max(6), place: z.string().min(1).max(64).optional(), look: z.enum(['3d']).optional() });
export type MapFocus = z.infer<typeof MapFocusSchema>;

// ---- Мастеру: всё, включая скрытое и заметки ----

export interface GmMapRegion extends MapRegionPublic {
  key: string;
  visible: boolean;
  noteGm: string;
}
export interface GmMapPlace extends MapPlacePublic {
  key: string | null;
  visible: boolean;
  noteGm: string;
}
export interface GmMapToken {
  id: string;
  kind: 'pc' | 'npc';
  /** id персонажа или противника */
  refId: string;
  name: string;
  figure: Figure | null;
  model: UnitId | null;
  x: number;
  y: number;
  visible: boolean;
}
/** Кого можно поставить на карту: все персонажи и противники комнаты. */
export interface GmMapPiece {
  kind: 'pc' | 'npc';
  refId: string;
  name: string;
  figure: Figure | null;
}
export interface GmMapView {
  id: MapId;
  title: string;
  parent: MapId | null;
  regions: GmMapRegion[];
  places: GmMapPlace[];
  /** Все дороги; open — открыты оба конца (игрок её видит). */
  roads: { d: string; open: boolean; a: string; b: string }[];
  party: { mapId: MapId; x: number; y: number; visible: boolean; move: PartyMove | null; figures: PartyFigure[] } | null;
  table: { mapId: MapId; focus: MapFocus | null } | null;
  tokens: GmMapToken[];
  pieces: GmMapPiece[];
}

// ---- Запросы мастера ----

export const PlaceWriteSchema = z.strictObject({
  name: z.string().trim().max(120).optional(),
  description: z.string().max(4000).optional(),
  ruler: z.string().trim().max(120).optional(),
  faction: z.string().trim().max(120).optional(),
  population: z.string().trim().max(60).optional(),
  kind: PlaceKindSchema.optional(),
  x: z.number().min(0).max(MAP_W).optional(),
  y: z.number().min(0).max(MAP_H).optional(),
  side: SideSchema.optional(),
  subtitle: z.string().trim().max(200).optional(),
  visible: z.boolean().optional(),
  noteGm: z.string().max(4000).optional(),
});
export const RegionWriteSchema = z.strictObject({ visible: z.boolean().optional(), noteGm: z.string().max(4000).optional() });
export const PartyWriteSchema = z.strictObject({ mapId: MapIdSchema, x: z.number().min(0).max(MAP_W), y: z.number().min(0).max(MAP_H), visible: z.boolean() }).nullable();
export const TableMapWriteSchema = z.strictObject({ mapId: MapIdSchema.nullable(), focus: MapFocusSchema.nullable().default(null) });

const X = z.number().min(0).max(MAP_W);
const Y = z.number().min(0).max(MAP_H);
export const TokenAddSchema = z.strictObject({ kind: TokenKindSchema, refId: z.string().min(1).max(64), x: X, y: Y, visible: z.boolean().optional() });
export const TokenWriteSchema = z.strictObject({ x: X.optional(), y: Y.optional(), visible: z.boolean().optional() });

// ---- Запросы игрока ----

export const NoteWriteSchema = z.strictObject({ x: z.number().min(0).max(MAP_W), y: z.number().min(0).max(MAP_H), text: z.string().trim().min(1).max(1000) });

// ---- Города (этап 27): карточка места, места в городе, слухи и задания, кто здесь ----

export const SpotKindSchema = z.enum(SPOT_KINDS);
export const RumorKindSchema = z.enum(RUMOR_KINDS);
const ImageSchema = z.strictObject({ url: z.string(), w: z.number(), h: z.number() });

/** Кто здесь: противник из библиотеки — только имя, внешность и роль, которую написал мастер («трактирщик»). Без id противника. */
export const PresencePublicSchema = z.strictObject({ id: z.string(), name: z.string(), label: z.string(), figure: FigureSchema.nullable() });
export type PresencePublic = z.infer<typeof PresencePublicSchema>;

/**
 * Место для игрока и стола: карточка и экран города. Только видимое: скрытые места в городе, слухи и «кто здесь»
 * не уходят вовсе, без счётчиков. Слухи — в порядке, в каком мастер их открыл (сами времена не уходят).
 */
export const PlaceDetailPublicSchema = z.strictObject({
  id: z.string(),
  /** отряд рядом — можно войти: только тогда игроку приходят места в городе, слухи и «кто здесь» (столу — всегда) */
  inside: z.boolean(),
  mapId: MapIdSchema,
  name: z.string(),
  kind: PlaceKindSchema,
  subtitle: z.string(),
  ink: z.string().nullable(),
  description: z.string(),
  ruler: z.string(),
  faction: z.string(),
  population: z.string(),
  image: ImageSchema.nullable(),
  spots: z.array(z.strictObject({ id: z.string(), kind: SpotKindSchema, name: z.string(), description: z.string(), here: z.array(PresencePublicSchema) })),
  rumors: z.array(z.strictObject({ id: z.string(), kind: RumorKindSchema, text: z.string() })),
  here: z.array(PresencePublicSchema),
});
export type PlaceDetailPublic = z.infer<typeof PlaceDetailPublicSchema>;

export interface GmSpot {
  id: string;
  kind: SpotKind;
  name: string;
  description: string;
  visible: boolean;
  noteGm: string;
  sort: number;
}
export interface GmRumor {
  id: string;
  kind: RumorKind;
  text: string;
  visible: boolean;
  /** когда открыт игрокам (порядок у игроков), null — ещё не открыт */
  revealedAt: number | null;
  noteGm: string;
}
export interface GmPresence {
  id: string;
  npcId: string;
  name: string;
  figure: Figure | null;
  spotId: string | null;
  label: string;
  visible: boolean;
}
/** Мастеру — карточка места целиком. */
export interface GmPlaceDetail {
  id: string;
  mapId: MapId;
  name: string;
  kind: z.infer<typeof PlaceKindSchema>;
  subtitle: string;
  visible: boolean;
  description: string;
  ruler: string;
  faction: string;
  population: string;
  noteGm: string;
  image: { url: string; w: number; h: number } | null;
  spots: GmSpot[];
  rumors: GmRumor[];
  presence: GmPresence[];
  /** противники библиотеки — кого можно добавить в «Кто здесь» */
  npcs: { id: string; name: string }[];
  /** ключ Claude API задан и это не демо-комната */
  drafts: boolean;
}

export const SpotWriteSchema = z.strictObject({
  kind: SpotKindSchema.optional(),
  name: z.string().trim().max(120).optional(),
  description: z.string().max(4000).optional(),
  visible: z.boolean().optional(),
  noteGm: z.string().max(4000).optional(),
  sort: z.number().int().min(0).max(1000).optional(),
});
export const RumorWriteSchema = z.strictObject({
  kind: RumorKindSchema.optional(),
  text: z.string().trim().max(1000).optional(),
  visible: z.boolean().optional(),
  noteGm: z.string().max(4000).optional(),
});
export const PresenceAddSchema = z.strictObject({
  npcId: z.string().min(1).max(64),
  spotId: z.string().min(1).max(64).nullable().default(null),
  label: z.string().trim().max(120).default(''),
});
export const PresenceWriteSchema = z.strictObject({
  spotId: z.string().min(1).max(64).nullable().optional(),
  label: z.string().trim().max(120).optional(),
  visible: z.boolean().optional(),
});

/** Черновик Claude для места: описание, места в городе или слухи. Сохраняет человек. */
export const PlaceDraftSchema = z.strictObject({ part: z.enum(['description', 'spots', 'rumors']) });
export type PlaceDraft =
  | { part: 'description'; text: string }
  | { part: 'spots'; spots: { kind: SpotKind; name: string; description: string }[] }
  | { part: 'rumors'; rumors: { kind: RumorKind; text: string }[] };

// ---- Путь (этап 28): предложения игроков и поход отряда ----

export const ProposeSchema = z.strictObject({ placeId: z.string().min(1).max(64) });
/** Своё предложение игрока на этой карте (чужих он не видит). */
export const ProposalPublicSchema = z.strictObject({ placeId: z.string(), placeName: z.string(), status: z.enum(['pending', 'accepted', 'declined']), days: z.number() });
export type ProposalPublic = z.infer<typeof ProposalPublicSchema>;
export interface GmProposal {
  id: string;
  mapId: MapId;
  placeId: string;
  placeName: string;
  /** кто предложил: имя игрока и его персонажа */
  who: string;
  days: number;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}
export const ProposalDecideSchema = z.strictObject({ status: z.enum(['accepted', 'declined']) });
export const TravelSchema = z.strictObject({ mapId: MapIdSchema, placeId: z.string().min(1).max(64) });
