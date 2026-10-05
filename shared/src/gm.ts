import { z } from 'zod';

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

export type OverloadSign = 'none' | 'eyes' | 'skin';

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

export const SIGN_TEXT: Record<OverloadSign, string> = {
  none: 'Зелени не видно',
  eyes: 'Глаза зеленеют',
  skin: 'Кожу покрывает изумруд',
};

// ---- Заметки сессии ----

export const NoteSaveSchema = z.strictObject({ text: z.string().max(100000), baseUpdatedAt: z.number().int().min(0) });

export interface GmNote {
  sessionId: string;
  text: string;
  updatedAt: number;
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
