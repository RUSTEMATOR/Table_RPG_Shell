import { z } from 'zod';
import { MapFocusSchema, MapIdSchema } from './maps.ts';

// ---- Общий экран: что видит стол (белый список, strictObject) ----

export const TableSceneSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  image: z.strictObject({ url: z.string(), w: z.number(), h: z.number() }).optional(),
});
export type TableScene = z.infer<typeof TableSceneSchema>;

/** Противник на столе: только имя и портрет. Сила и заметки мастера сюда не попадают. */
export const TableNpcSchema = z.strictObject({
  name: z.string(),
  image: z.strictObject({ url: z.string(), w: z.number(), h: z.number() }).optional(),
});
export type TableNpc = z.infer<typeof TableNpcSchema>;

/** Карта на столе: какая и куда навести камеру (null — вся карта). Содержимое стол берёт отдельно, только открытое. */
export const TableMapSchema = z.strictObject({ id: MapIdSchema, focus: MapFocusSchema.nullable() });
export const TableStateSchema = z.strictObject({ scene: TableSceneSchema.nullable(), npc: TableNpcSchema.nullable(), map: TableMapSchema.nullable() });
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
  image: { url: string; w: number; h: number; bytes: number } | null;
  shown: boolean;
  updatedAt: number;
}

// ---- Библиотека противников (только мастеру) ----

export const NpcWriteSchema = z.strictObject({
  name: z.string().trim().max(120).default(''),
  power: z.number().int().min(1).max(99999).nullable().default(null),
  notes: z.string().max(20000).default(''),
});

export interface GmNpc {
  id: string;
  name: string;
  power: number | null;
  /** Ступень силы словом, пусто — сила не задана. */
  band: string;
  notes: string;
  image: { url: string; w: number; h: number; bytes: number } | null;
  /** Портрет сейчас на столе. */
  shown: boolean;
  /** Противник текущей сессии. */
  opponent: boolean;
  updatedAt: number;
}
