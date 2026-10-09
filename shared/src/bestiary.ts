import { z } from 'zod';
import { FigureSchema } from './figure.ts';
import { UnitIdSchema } from './maps.ts';

// Бестиарий (этап 50): чудища, с которыми бился отряд. Общая коллекция комнаты. Сила, заметки мастера и портрет не уходят.

export const BestiaryEntryPlayerSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  figure: FigureSchema.nullable(),
  model3d: UnitIdSchema.nullable(),
  text: z.string(),
  firstAt: z.number(),
  /** Сколько сессий был противником. */
  fights: z.number().int(),
});
export type BestiaryEntryPlayer = z.infer<typeof BestiaryEntryPlayerSchema>;
export const BestiaryPlayerSchema = z.strictObject({
  entries: z.array(BestiaryEntryPlayerSchema),
  /** Всего чудищ в бестиарии (с закрытыми): полнота коллекции. */
  total: z.number().int(),
});
export type BestiaryPlayer = z.infer<typeof BestiaryPlayerSchema>;

export const BestiaryToggleSchema = z.strictObject({ open: z.boolean() });
