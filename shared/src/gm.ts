import { z } from 'zod';
import { SUMMARY_KINDS, type OverloadSign, type SummaryKindKey } from './constants.ts';

// ---- Дневник игрока ----

export const DiaryWriteSchema = z.strictObject({
  text: z.string().trim().min(1).max(8000),
  /** Только для себя: мастер не видит ни через экран, ни через API; в ИИ не уходит. */
  private: z.boolean().default(false),
  /** Запрос мастеру (например, на раскрытие). Не может быть личным. */
  request: z.boolean().default(false),
});

export const DiaryEntryPlayerSchema = z.strictObject({
  id: z.string(),
  text: z.string(),
  private: z.boolean(),
  request: z.boolean(),
  requestState: z.enum(['open', 'answered']).optional(),
  reply: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type DiaryEntryPlayer = z.infer<typeof DiaryEntryPlayerSchema>;
export const DiaryListPlayerSchema = z.strictObject({ entries: z.array(DiaryEntryPlayerSchema) });

export interface DiarySuggestion {
  traitName: string;
  score: number;
}

export interface GmDiaryEntry {
  id: string;
  memberId: string;
  memberName: string;
  characterName: string | null;
  text: string;
  request: boolean;
  requestState: 'open' | 'answered' | null;
  reply: string;
  createdAt: number;
  updatedAt: number;
  suggestions: DiarySuggestion[];
}

export const DiaryReplySchema = z.strictObject({
  reply: z.string().trim().max(4000),
  close: z.boolean().default(true),
});

// ---- Перегрузка зелёной магией (только мастер; столу — по кнопке, только видимый признак) ----

export interface GmOverload {
  characterId: string;
  name: string;
  value: number;
  eyesAt: number;
  skinAt: number;
  sign: OverloadSign;
}

export const OverloadChangeSchema = z.strictObject({
  delta: z.union([z.literal(1), z.literal(-1)]).optional(),
  reset: z.boolean().optional(),
  eyesAt: z.number().int().min(1).max(99).optional(),
  skinAt: z.number().int().min(1).max(99).optional(),
});

// ---- Заметки сессии ----

export const NoteSaveSchema = z.strictObject({
  text: z.string().max(100000),
  baseUpdatedAt: z.number().int().min(0),
  /** Сессия, к которой шла правка: если мастер начал новую, сохранение не уйдёт в чужие заметки. */
  sessionId: z.string().max(64).optional(),
});

export interface GmNote {
  sessionId: string;
  text: string;
  updatedAt: number;
}

/** Заметки прошлой сессии (только чтение). */
export interface GmPastNote {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  text: string;
}

// ---- Подсказки Jev мастеру ----

export interface HintCheck {
  status: 'ok' | 'warn' | 'unavailable' | 'off';
  /** Насколько подсказка раскрывает свою черту, 0–4. */
  selfScore: number | null;
  /** Другие скрытые черты, которые текст, похоже, выдаёт. */
  others: { traitName: string; probability: number }[];
}

export interface GreenSuggestion {
  rollId: string;
  characterId: string;
  characterName: string;
  probability: number;
}

// ---- ИИ-сводки ----

export interface GmSummary {
  kind: SummaryKindKey;
  text: string;
  at: number;
  edited: boolean;
  /** Опубликовано игроку (только player и crossing). */
  show: boolean;
  tone: string;
  person: string;
  model: string;
}

export const SummaryGenerateSchema = z.strictObject({
  tone: z.string().max(40),
  person: z.string().max(4).default('2'),
  quick: z.boolean().default(false),
});

export const SummarySaveSchema = z.strictObject({
  text: z.string().max(20000).optional(),
  show: z.boolean().optional(),
});

export interface SummaryCheck {
  leak: { status: 'ok' | 'warn' | 'unavailable' | 'off'; others: { traitName: string; probability: number }[] };
  facts: { status: 'ok' | 'warn' | 'unavailable' | 'off'; flagged: { sentence: string; probability: number }[] };
}

export interface SummaryOptions {
  configured: boolean;
  tones: string[];
  persons: { key: string; label: string }[];
}
