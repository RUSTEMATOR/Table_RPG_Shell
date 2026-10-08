import { z } from 'zod';

// Письма персонажам (этап 42). Игроку — только доставленные письма и только белый список полей:
// ни заметки мастера, ни времени запланированной доставки, ни самого факта недоставленного письма.

export const LetterWriteSchema = z.strictObject({
  characterId: z.string().min(1).max(64),
  fromName: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(8000),
  /** Только мастеру. */
  noteGm: z.string().max(4000).default(''),
  /** Когда доставить (мс); не задано или в прошлом — сразу. */
  deliverAt: z.number().int().positive().optional(),
});

/** Правка: до доставки — всё; после — только заметка мастера. */
export const LetterPatchSchema = z.strictObject({
  fromName: z.string().trim().min(1).max(120).optional(),
  text: z.string().trim().min(1).max(8000).optional(),
  noteGm: z.string().max(4000).optional(),
  deliverAt: z.number().int().positive().optional(),
});

export const LetterDraftSchema = z.strictObject({
  characterId: z.string().min(1).max(64),
  fromName: z.string().trim().min(1).max(120),
  hint: z.string().trim().max(2000).default(''),
});

export const LetterReplySchema = z.strictObject({ text: z.string().trim().max(4000) });

export const LetterPlayerSchema = z.strictObject({
  id: z.string(),
  from: z.string(),
  text: z.string(),
  deliveredAt: z.number(),
  readAt: z.number().nullable(),
  reply: z.string(),
  repliedAt: z.number().nullable(),
});
export type LetterPlayer = z.infer<typeof LetterPlayerSchema>;
export const LetterListPlayerSchema = z.strictObject({ letters: z.array(LetterPlayerSchema) });

export type LetterStatus = 'scheduled' | 'delivered' | 'read' | 'replied';

export interface GmLetter {
  id: string;
  characterId: string;
  characterName: string;
  /** Игрок-владелец персонажа сейчас; null — персонаж никому не выдан (письмо дождётся). */
  memberName: string | null;
  fromName: string;
  text: string;
  noteGm: string;
  deliverAt: number;
  deliveredAt: number | null;
  readAt: number | null;
  reply: string;
  repliedAt: number | null;
  status: LetterStatus;
  createdAt: number;
  updatedAt: number;
}
