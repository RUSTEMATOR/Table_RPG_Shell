import { z } from 'zod';

// Анкета персонажа (этап 55): игрок без персонажа рассказывает мастеру, кого хочет играть. Видят игрок (своё) и мастер.
// В Jev и Claude не уходит; столу и другим игрокам — нет.

export const QuestionnaireAnswersSchema = z.strictObject({
  name: z.string().trim().max(120).default(''),
  pronoun: z.enum(['', 'он', 'она', 'они']).default(''),
  source: z.string().max(40).default(''),
  universe: z.string().max(40).default(''),
  concept: z.string().trim().max(500).default(''),
  past: z.string().trim().max(2000).default(''),
  wants: z.string().trim().max(500).default(''),
  fears: z.string().trim().max(500).default(''),
  ties: z.string().trim().max(500).default(''),
  avoid: z.string().trim().max(500).default(''),
});
export type QuestionnaireAnswers = z.infer<typeof QuestionnaireAnswersSchema>;

export const QUESTIONNAIRE_LABELS: Record<Exclude<keyof QuestionnaireAnswers, 'pronoun' | 'source' | 'universe'>, string> = {
  name: 'Как зовут',
  concept: 'Кто он (в двух словах)',
  past: 'Откуда и что было до',
  wants: 'Чего хочет',
  fears: 'Чего боится',
  ties: 'Связь с другими персонажами',
  avoid: 'Чего не хочется видеть в игре',
};

const Entry = z.strictObject({ key: z.string(), label: z.string() });
export const QuestionnairePlayerSchema = z.strictObject({
  answers: QuestionnaireAnswersSchema.nullable(),
  submittedAt: z.number().nullable(),
  /** Справочник жанров и вселенных рандомизатора — для выбора. */
  sources: z.array(Entry),
  universes: z.array(z.strictObject({ key: z.string(), label: z.string(), genre: z.string() })),
});
export type QuestionnairePlayer = z.infer<typeof QuestionnairePlayerSchema>;

export interface GmQuestionnaire {
  memberId: string;
  memberName: string;
  hasCharacter: boolean;
  answers: QuestionnaireAnswers;
  sourceLabel: string;
  universeLabel: string;
  submittedAt: number;
  updatedAt: number;
}
