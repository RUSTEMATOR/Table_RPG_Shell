import { z } from 'zod';

// Расписание и явка (этап 46): варианты даты для голосования и назначенная игра; ответы «буду / может быть / не смогу».
// Игроку — даты, заметка, ответы с именами персонажей и свой ответ. Столу не уходит.

export const VOTE_ANSWERS = ['yes', 'maybe', 'no'] as const;
export type VoteAnswer = (typeof VOTE_ANSWERS)[number];
export const VOTE_LABELS: Record<VoteAnswer, string> = { yes: 'Буду', maybe: 'Может быть', no: 'Не смогу' };

export const DEFAULT_GAME_MINUTES = 240;

export const SlotWriteSchema = z.strictObject({
  startsAt: z.number().int().positive(),
  durationMin: z
    .number()
    .int()
    .min(30)
    .max(24 * 60)
    .default(DEFAULT_GAME_MINUTES),
  /** Видят игроки: где собираемся, что взять. */
  note: z.string().trim().max(500).default(''),
});
export const VoteWriteSchema = z.strictObject({ answer: z.enum(VOTE_ANSWERS) });

const AnswerSchema = z.strictObject({ name: z.string(), answer: z.enum(VOTE_ANSWERS) });
export const SlotPlayerSchema = z.strictObject({
  id: z.string(),
  startsAt: z.number(),
  durationMin: z.number(),
  note: z.string(),
  answers: z.array(AnswerSchema),
  my: z.enum(VOTE_ANSWERS).nullable(),
});
export type SlotPlayer = z.infer<typeof SlotPlayerSchema>;
export const SchedulePlayerSchema = z.strictObject({
  /** Назначенная игра (ещё не прошедшая), null — не назначена. */
  planned: SlotPlayerSchema.nullable(),
  /** Варианты голосования, по времени. */
  options: z.array(SlotPlayerSchema),
});
export type SchedulePlayer = z.infer<typeof SchedulePlayerSchema>;

export interface GmSlot extends SlotPlayer {
  kind: 'option' | 'planned';
  remindedDay: boolean;
  remindedHour: boolean;
  createdAt: number;
}
export interface GmSchedule {
  planned: GmSlot | null;
  options: GmSlot[];
  /** Игроки без ответа у назначенной игры. */
  silent: string[];
}
