import { z } from 'zod';

// ---- Карты мира (этап 21) ----
// Координаты — в единицах карты 1600×1100 (как в макетах). Рельеф — в клиенте (web/src/maps/art), всё остальное — отсюда.

export const MAP_IDS = ['world', 'razdolye', 'frozen'] as const;
export const MapIdSchema = z.enum(MAP_IDS);
export type MapId = z.infer<typeof MapIdSchema>;
export const MAP_W = 1600;
export const MAP_H = 1100;

export const PLACE_KINDS = ['capital', 'city', 'town', 'bigtown', 'elven', 'college', 'village', 'camp', 'church', 'crypt', 'cult', 'vampire', 'lake', 'storm', 'mark'] as const;
export const PlaceKindSchema = z.enum(PLACE_KINDS);
export type PlaceKind = z.infer<typeof PlaceKindSchema>;
export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  capital: 'Столица',
  city: 'Город',
  town: 'Поселение',
  bigtown: 'Крупный город',
  elven: 'Эльфийский город',
  college: 'Коллегия магов',
  village: 'Деревня',
  camp: 'Лагерь',
  church: 'Храм',
  crypt: 'Крипта',
  cult: 'Культ',
  vampire: 'Лагерь вампиров',
  lake: 'Озеро',
  storm: 'Буря',
  mark: 'Отметка',
};

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

/** Карта для игрока и стола: только открытое. notes — личные заметки игрока (столу — пусто). */
export const MapPublicSchema = z.strictObject({
  id: MapIdSchema,
  title: z.string(),
  parent: MapIdSchema.nullable(),
  regions: z.array(MapRegionPublicSchema),
  places: z.array(MapPlacePublicSchema),
  roads: z.array(z.strictObject({ d: z.string() })),
  party: z.strictObject({ x: Num, y: Num }).nullable(),
  notes: z.array(MapNoteSchema),
});
export type MapPublic = z.infer<typeof MapPublicSchema>;

/** Наезд камеры на столе: точка и масштаб (1 — вся карта). */
export const MapFocusSchema = z.strictObject({ x: Num, y: Num, zoom: z.number().min(1).max(6) });
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
export interface GmMapView {
  id: MapId;
  title: string;
  parent: MapId | null;
  regions: GmMapRegion[];
  places: GmMapPlace[];
  /** Все дороги; open — открыты оба конца (игрок её видит). */
  roads: { d: string; open: boolean }[];
  party: { mapId: MapId; x: number; y: number; visible: boolean } | null;
  table: { mapId: MapId; focus: MapFocus | null } | null;
}

// ---- Запросы мастера ----

export const PlaceWriteSchema = z.strictObject({
  name: z.string().trim().max(120).optional(),
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

// ---- Запросы игрока ----

export const NoteWriteSchema = z.strictObject({ x: z.number().min(0).max(MAP_W), y: z.number().min(0).max(MAP_H), text: z.string().trim().min(1).max(1000) });
