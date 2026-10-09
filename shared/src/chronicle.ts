import { z } from 'zod';
import { ImagePublicSchema, type GmImage } from './media.ts';

// Летопись (этап 43): главы по сессиям и викторина «Что ты помнишь?». Игроку — только опубликованные главы,
// вопросы без верных ответов; верные открываются вместе с его результатом после ответа.

export const QUIZ_OPTIONS = 3;
export const QUIZ_MAX = 5;

export const QuizQuestionSchema = z.strictObject({
  q: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(160)).length(QUIZ_OPTIONS),
  /** Индекс верного варианта. */
  answer: z
    .number()
    .int()
    .min(0)
    .max(QUIZ_OPTIONS - 1),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export const QuizSchema = z.array(QuizQuestionSchema).min(1).max(QUIZ_MAX);

export const ChapterWriteSchema = z.strictObject({
  sessionId: z.string().min(1).max(64).nullable().default(null),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(30000),
  quiz: QuizSchema.nullable().default(null),
});
export const ChapterPatchSchema = z.strictObject({
  sessionId: z.string().min(1).max(64).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  text: z.string().trim().min(1).max(30000).optional(),
  quiz: QuizSchema.nullable().optional(),
});
export const ChapterDraftSchema = z.strictObject({ sessionId: z.string().min(1).max(64).nullable().default(null), hint: z.string().trim().max(2000).default('') });
export const ChapterAnswerSchema = z.strictObject({
  answers: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(QUIZ_OPTIONS - 1),
    )
    .min(1)
    .max(QUIZ_MAX),
});

export const QuizQuestionPlayerSchema = z.strictObject({ q: z.string(), options: z.array(z.string()).length(QUIZ_OPTIONS) });
export const QuizResultSchema = z.strictObject({
  answers: z.array(z.number().int()),
  /** Верные индексы — открываются только после ответа. */
  correct: z.array(z.number().int()),
  score: z.number().int(),
  total: z.number().int(),
  at: z.number(),
});
export const PHOTO_MAX = 24;
export const PhotoPlayerSchema = z.strictObject({ id: z.string(), caption: z.string(), image: ImagePublicSchema });
export type PhotoPlayer = z.infer<typeof PhotoPlayerSchema>;
export const PhotoCaptionSchema = z.strictObject({ caption: z.string().trim().max(200) });

export const ChapterPlayerSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  publishedAt: z.number(),
  /** Фото сессии (этап 53). */
  photos: z.array(PhotoPlayerSchema),
  quiz: z.array(QuizQuestionPlayerSchema).nullable(),
  result: QuizResultSchema.nullable(),
});
export type ChapterPlayer = z.infer<typeof ChapterPlayerSchema>;
export const ChapterListPlayerSchema = z.strictObject({ chapters: z.array(ChapterPlayerSchema) });

export type ChapterStatus = 'draft' | 'published';

export interface GmChapterAnswer {
  memberName: string;
  characterName: string | null;
  answers: number[];
  score: number;
  total: number;
  at: number;
}

export interface GmChapter {
  id: string;
  sessionId: string | null;
  sessionStartedAt: number | null;
  title: string;
  text: string;
  quiz: QuizQuestion[] | null;
  status: ChapterStatus;
  publishedAt: number | null;
  answers: GmChapterAnswer[];
  photos: { id: string; caption: string; image: GmImage }[];
  createdAt: number;
  updatedAt: number;
}

/** Сессии комнаты для выбора в редакторе главы. */
export interface GmSessionItem {
  id: string;
  startedAt: number;
  endedAt: number | null;
  hasNote: boolean;
  chapters: number;
}
