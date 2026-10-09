import { z } from 'zod';

// Искры (этап 48): жетоны вдохновения. Журнал ±1 по персонажу; баланс — сумма, не бывает отрицательным.

export const SPARK_KINDS = ['award', 'quiz', 'spend'] as const;
export type SparkKind = (typeof SPARK_KINDS)[number];
export const SPARK_KIND_LABELS: Record<SparkKind, string> = { award: 'от мастера', quiz: 'за викторину', spend: 'переброс' };

/** Не позже скольких минут после броска его можно перебросить. */
export const REROLL_WINDOW_MS = 10 * 60_000;

export const SparkAwardSchema = z.strictObject({
  characterId: z.string().min(1).max(64),
  reason: z.string().trim().min(1).max(120),
});

export interface GmSpark {
  id: string;
  delta: number;
  kind: SparkKind;
  reason: string;
  at: number;
}
export interface GmSparks {
  balance: number;
  ledger: GmSpark[];
}

export const SparksPlayerSchema = z.strictObject({ balance: z.number().int() });
