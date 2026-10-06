import { z } from 'zod';

// ---- Фигурка (этап 23): пиксель-арт персонажа и противника из деталей LPC ----
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

export const FigureSchema = z.strictObject({
  v: z.literal(1),
  body: z.enum(['male', 'female']),
  /** Цвет кожи (палитра тела LPC): тело и голова. */
  skin: Key,
  parts: z.strictObject(Object.fromEntries(FIGURE_SLOTS.map((s) => [s, FigurePartSchema.optional()])) as Record<FigureSlot, z.ZodOptional<typeof FigurePartSchema>>),
});
export type Figure = z.infer<typeof FigureSchema>;
