import { z } from 'zod';

// ---- Фигурка (этап 23): пиксель-арт персонажа и противника из деталей LPC; у противника — ещё существо (этап 33) ----
// Хранится только описание: тело, кожа, детали и их цвета. Картинку собирает клиент (web/src/figure).
// Фигурка — внешность, не секрет: её видят игрок, другие игроки (на карте) и стол.

export const FIGURE_SLOTS = ['body', 'head', 'hair', 'beard', 'torso', 'armour', 'cape', 'legs', 'feet', 'headwear', 'weapon'] as const;
export type FigureSlot = (typeof FIGURE_SLOTS)[number];

const Key = z
  .string()
  .max(40)
  .regex(/^[a-z0-9_]+$/);
export const FigurePartSchema = z.strictObject({ id: Key, color: Key.optional() });
export type FigurePart = z.infer<typeof FigurePartSchema>;

/** Человек (и человекоподобные: орк, гоблин, скелет…) — из деталей. Только такие у персонажей игроков. */
export const HumanFigureSchema = z.strictObject({
  v: z.literal(1),
  body: z.enum(['male', 'female']),
  /** Цвет кожи (палитра тела LPC): тело и голова. */
  skin: Key,
  parts: z.strictObject(Object.fromEntries(FIGURE_SLOTS.map((s) => [s, FigurePartSchema.optional()])) as Record<FigureSlot, z.ZodOptional<typeof FigurePartSchema>>),
});
export type HumanFigure = z.infer<typeof HumanFigureSchema>;

// Существа (этап 33): целый лист «[LPC] Monsters», без деталей и цветов. Список — как в web/src/figure/creatures.json (tools/extract-lpc/creatures.mjs).
export const CREATURE_IDS = ['bat', 'bee', 'snake', 'slime', 'ghost', 'eyeball', 'small_worm', 'big_worm', 'pumpking', 'man_eater_flower'] as const;
export type CreatureId = (typeof CREATURE_IDS)[number];
export const CreatureFigureSchema = z.strictObject({ v: z.literal(1), creature: z.enum(CREATURE_IDS) });
export type CreatureFigure = z.infer<typeof CreatureFigureSchema>;

/** Фигурка противника — человек или существо; у персонажей игроков — только человек (HumanFigureSchema). */
export const FigureSchema = z.union([HumanFigureSchema, CreatureFigureSchema]);
export type Figure = z.infer<typeof FigureSchema>;
export const isCreature = (f: Figure): f is CreatureFigure => 'creature' in f;
