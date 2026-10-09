import { z } from 'zod';

// Памятные моменты (этап 47): значки за события кампании. Выдаёт мастер; игрок и стол видят вид, заголовок и пояснение.

export const MOMENT_KINDS = ['crit', 'fumble', 'savior', 'bravery', 'wit', 'luck', 'sacrifice', 'discovery', 'custom'] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];
export const MOMENT_KIND_LABELS: Record<MomentKind, string> = {
  crit: 'Двадцатка',
  fumble: 'Единица',
  savior: 'Спас товарища',
  bravery: 'Храбрость',
  wit: 'Находчивость',
  luck: 'Удача',
  sacrifice: 'Жертва',
  discovery: 'Открытие',
  custom: 'Особый',
};

export const MomentWriteSchema = z.strictObject({
  /** Либо персонаж, либо бросок (персонаж — автора броска). */
  characterId: z.string().min(1).max(64).optional(),
  rollId: z.string().min(1).max(64).optional(),
  kind: z.enum(MOMENT_KINDS),
  title: z.string().trim().min(1).max(80),
  text: z.string().trim().max(400).default(''),
  noteGm: z.string().trim().max(1000).default(''),
  /** Вместе с моментом дать искру (этап 48). */
  spark: z.boolean().default(false),
});

export const MomentPlayerSchema = z.strictObject({ id: z.string(), kind: z.enum(MOMENT_KINDS), title: z.string(), text: z.string(), at: z.number() });
export type MomentPlayer = z.infer<typeof MomentPlayerSchema>;

export interface GmMoment extends MomentPlayer {
  noteGm: string;
  rollId: string | null;
}

/** Столу: плашка на несколько секунд. */
export const TableMomentSchema = z.strictObject({ character: z.string(), kind: z.enum(MOMENT_KINDS), title: z.string(), at: z.number() });
export type TableMoment = z.infer<typeof TableMomentSchema>;
