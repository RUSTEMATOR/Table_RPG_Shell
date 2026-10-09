import { z } from 'zod';
import { ImagePublicSchema, type GmImage } from './media.ts';
import type { GmAcquaintance } from './acquaintances.ts';
import { TableAtmosphereSchema } from './atmosphere.ts';
import { MapFocusSchema, MapIdSchema, type UnitId } from './maps.ts';
import { FigureSchema, type Figure } from './figure.ts';

// ---- Общий экран: что видит стол (белый список, strictObject) ----

export const TableSceneSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  image: ImagePublicSchema.optional(),
});
export type TableScene = z.infer<typeof TableSceneSchema>;

/**
 * Противник на столе: имя, портрет, фигурка. Сила и заметки мастера сюда не попадают.
 * opponent — он же противник сессии: тогда публичные броски игроков с фигурками стол играет как удары по нему (этап 25).
 */
export const TableNpcSchema = z.strictObject({
  name: z.string(),
  image: ImagePublicSchema.optional(),
  figure: FigureSchema.nullable(),
  opponent: z.boolean(),
});
export type TableNpc = z.infer<typeof TableNpcSchema>;

/** Карта на столе: какая и куда навести камеру (null — вся карта). Содержимое стол берёт отдельно, только открытое. */
export const TableMapSchema = z.strictObject({ id: MapIdSchema, focus: MapFocusSchema.nullable() });
export const TableStateSchema = z.strictObject({
  scene: TableSceneSchema.nullable(),
  npc: TableNpcSchema.nullable(),
  map: TableMapSchema.nullable(),
  /** Атмосфера (этап 57). */
  atmosphere: TableAtmosphereSchema,
});
export type TableState = z.infer<typeof TableStateSchema>;

// ---- Сцены у мастера ----

export const SceneWriteSchema = z.strictObject({
  title: z.string().trim().max(200).default(''),
  textPublic: z.string().max(4000).default(''),
  /** Только мастеру: на стол не уходит никогда. */
  textGm: z.string().max(20000).default(''),
});

export interface GmScene {
  id: string;
  title: string;
  textPublic: string;
  textGm: string;
  image: GmImage | null;
  shown: boolean;
  updatedAt: number;
}

// ---- Библиотека противников (только мастеру) ----

export const NpcWriteSchema = z.strictObject({
  name: z.string().trim().max(120).default(''),
  power: z.number().int().min(1).max(99999).nullable().default(null),
  notes: z.string().max(20000).default(''),
  /** Бестиарий (этап 50): чудище и описание для игроков. Не присланы — не меняются. */
  bestiary: z.boolean().optional(),
  bestiaryText: z.string().trim().max(2000).optional(),
});

export interface GmNpc {
  id: string;
  name: string;
  power: number | null;
  /** Ступень силы словом, пусто — сила не задана. */
  band: string;
  notes: string;
  image: GmImage | null;
  figure: Figure | null;
  /** 3D-модель на 3D-карте (этап 34), null — фигурка как обычно. */
  model3d: UnitId | null;
  /** Портрет сейчас на столе. */
  shown: boolean;
  /** Противник текущей сессии. */
  opponent: boolean;
  /** Кто с ним знаком (этап 49). */
  acquaintances: GmAcquaintance[];
  /** Бестиарий (этап 50). */
  bestiary: boolean;
  bestiaryText: string;
  bestiaryUnlockedAt: number | null;
  fights: number;
  updatedAt: number;
}
