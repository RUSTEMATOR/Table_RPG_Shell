import { z } from 'zod';
import { FigureSchema } from './figure.ts';

// Знакомые (этап 49): жители мира, которых персонаж встретил в «Кто здесь». Заметка — только игроку (мастер не видит,
// в ИИ не уходит); отношение видит и мастер.

export const ATTITUDES = ['unknown', 'friend', 'wary', 'foe'] as const;
export type Attitude = (typeof ATTITUDES)[number];
export const ATTITUDE_LABELS: Record<Attitude, string> = { unknown: 'Не решил', friend: 'Друг', wary: 'Настороженно', foe: 'Враг' };

export const AcquaintanceWriteSchema = z.strictObject({
  attitude: z.enum(ATTITUDES).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const AcquaintancePlayerSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  /** Роль из последней встречи («трактирщик»), пусто — не подписан. */
  label: z.string(),
  figure: FigureSchema.nullable(),
  /** Где встретились впервые; null — место удалено. */
  place: z.string().nullable(),
  firstAt: z.number(),
  lastAt: z.number(),
  attitude: z.enum(ATTITUDES),
  note: z.string(),
});
export type AcquaintancePlayer = z.infer<typeof AcquaintancePlayerSchema>;
export const AcquaintanceListPlayerSchema = z.strictObject({ acquaintances: z.array(AcquaintancePlayerSchema) });

/** Мастеру у противника: кто с ним знаком. Заметки игроков сюда не попадают. */
export interface GmAcquaintance {
  characterName: string;
  attitude: Attitude;
  place: string | null;
  firstAt: number;
}
