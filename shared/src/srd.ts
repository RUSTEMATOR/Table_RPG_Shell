import { z } from 'zod';

// Справочник D&D 5e SRD 5.1 (CC-BY-4.0, через Open5e) — этап 50, шаг 5. Только мастеру: список для выбора чудища.

export const SrdMonsterSchema = z.strictObject({
  slug: z.string(),
  name: z.string(),
  size: z.string(),
  type: z.string(),
  subtype: z.string(),
  alignment: z.string(),
  cr: z.string(),
  crNum: z.number(),
  ac: z.number(),
  hp: z.number(),
  speed: z.string(),
  stats: z.array(z.number()).length(6),
  senses: z.string(),
  languages: z.string(),
  abilities: z.array(z.strictObject({ name: z.string(), desc: z.string() })),
  actions: z.array(z.strictObject({ name: z.string(), desc: z.string() })),
  legendary: z.boolean(),
});
export type SrdMonster = z.infer<typeof SrdMonsterSchema>;
export const SrdBestiarySchema = z.strictObject({
  source: z.string(),
  license: z.string(),
  attribution: z.string(),
  extractedAt: z.string(),
  monsters: z.array(SrdMonsterSchema),
});

/** Мастеру — список коротко; статблок целиком попадает в заметки при добавлении. */
export interface SrdListItem {
  slug: string;
  name: string;
  size: string;
  type: string;
  cr: string;
  /** Уровень силы «Зеленогорья» по CR. */
  power: number;
  band: string;
}
export const FromSrdSchema = z.strictObject({ slug: z.string().min(1).max(80) });
export const BeastDraftSchema = z.strictObject({ hint: z.string().trim().max(1000).default('') });
