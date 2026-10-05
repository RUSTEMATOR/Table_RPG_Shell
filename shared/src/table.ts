import { z } from 'zod';

// ---- Общий экран: что видит стол (белый список, strictObject) ----

export const TableSceneSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  image: z.strictObject({ url: z.string(), w: z.number(), h: z.number() }).optional(),
});
export type TableScene = z.infer<typeof TableSceneSchema>;

export const TableStateSchema = z.strictObject({ scene: TableSceneSchema.nullable() });
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
