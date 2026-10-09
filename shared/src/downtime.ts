import { z } from 'zod';

// Дела между сессиями (этап 44): чем персонаж занят до следующей игры. Одно дело на персонажа на сессию.
// Игроку — свой выбор и итог мастера после разбора; подсказка мастера и черновик итога игроку не уходят.

export const DOWNTIME_KINDS = ['train', 'craft', 'research', 'visit', 'earn', 'rest', 'other'] as const;
export type DowntimeKind = (typeof DOWNTIME_KINDS)[number];
export const DOWNTIME_KIND_LABELS: Record<DowntimeKind, string> = {
  train: 'Тренировка',
  craft: 'Ремесло',
  research: 'Разузнать',
  visit: 'Навестить',
  earn: 'Подработать',
  rest: 'Отдых',
  other: 'Другое',
};
export const DOWNTIME_KIND_HINTS: Record<DowntimeKind, string> = {
  train: 'Оттачивать умение, учиться у кого-то, упражняться.',
  craft: 'Смастерить, починить, сварить, вырезать — что-то сделать руками.',
  research: 'Разузнать, расспросить, покопаться в книгах или слухах.',
  visit: 'Съездить к кому-то, навестить, передать весть.',
  earn: 'Подработать: караван, стража, ярмарка, помощь по хозяйству.',
  rest: 'Отлежаться, отдохнуть, залечить раны и душу.',
  other: 'Своё — опиши словами.',
};

export const DowntimeWriteSchema = z.strictObject({
  kind: z.enum(DOWNTIME_KINDS),
  text: z.string().trim().max(2000).default(''),
});
export const DowntimeResolveSchema = z.strictObject({ outcome: z.string().trim().min(1).max(4000) });
export const DowntimeDraftSchema = z.strictObject({ hint: z.string().trim().max(2000).default('') });

export const DowntimePlayerSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(DOWNTIME_KINDS),
  text: z.string(),
  /** Итог мастера — только после разбора. */
  outcome: z.string().nullable(),
  resolvedAt: z.number().nullable(),
  /** Дело относится к текущей сессии (иначе — к прошлой, и после разбора можно выбрать новое). */
  current: z.boolean(),
  updatedAt: z.number(),
});
export type DowntimePlayer = z.infer<typeof DowntimePlayerSchema>;
/** Текущее дело и, если есть, прошлое неразобранное или только что разобранное. */
export const DowntimeStatePlayerSchema = z.strictObject({ current: DowntimePlayerSchema.nullable(), previous: DowntimePlayerSchema.nullable() });
export type DowntimeStatePlayer = z.infer<typeof DowntimeStatePlayerSchema>;

export interface GmDowntime {
  id: string;
  sessionId: string;
  sessionStartedAt: number;
  current: boolean;
  characterId: string;
  characterName: string;
  memberName: string | null;
  kind: DowntimeKind;
  text: string;
  outcome: string | null;
  resolvedAt: number | null;
  createdAt: number;
  updatedAt: number;
}
