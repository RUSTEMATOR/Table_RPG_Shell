import { and, desc, eq } from 'drizzle-orm';
import { DiaryEntryPlayerSchema, type DiaryEntryPlayer, type DiarySuggestion, type GmDiaryEntry } from '@zg/shared';
import { db, schema } from '../db/client.ts';
import { lastJudgment } from '../ai/jev/judgments.ts';

export type DiaryRow = typeof schema.diaryEntry.$inferSelect;

export function diaryForPlayer(r: DiaryRow): DiaryEntryPlayer {
  return DiaryEntryPlayerSchema.parse({
    id: r.id,
    text: r.text,
    private: r.private,
    request: r.request,
    ...(r.requestState ? { requestState: r.requestState } : {}),
    ...(r.reply ? { reply: r.reply } : {}),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
}

/** Для мастера. Личные записи сюда не попадают никогда — вызывающий обязан их отфильтровать. */
export function diaryForGm(r: DiaryRow): GmDiaryEntry {
  if (r.private) throw new Error('Личная запись дневника не отдаётся мастеру');
  const m = db.select({ n: schema.member.name }).from(schema.member).where(eq(schema.member.id, r.memberId)).get();
  const c = r.characterId
    ? db.select({ n: schema.character.name }).from(schema.character).where(eq(schema.character.id, r.characterId)).get()
    : undefined;
  return {
    id: r.id,
    memberId: r.memberId,
    memberName: m?.n ?? '',
    characterName: c?.n ?? null,
    text: r.text,
    request: r.request,
    requestState: r.requestState ?? null,
    reply: r.reply,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    suggestions: lastJudgment<DiarySuggestion[]>('diaryMatch.suggestions', r.id) ?? [],
  };
}

export function listOwnDiary(roomId: string, memberId: string): DiaryRow[] {
  return db
    .select()
    .from(schema.diaryEntry)
    .where(and(eq(schema.diaryEntry.roomId, roomId), eq(schema.diaryEntry.memberId, memberId)))
    .orderBy(desc(schema.diaryEntry.createdAt))
    .limit(500)
    .all();
}

/** Мастеру — только не личные записи. Фильтр в запросе, а не после. */
export function listDiaryForGm(roomId: string): DiaryRow[] {
  return db
    .select()
    .from(schema.diaryEntry)
    .where(and(eq(schema.diaryEntry.roomId, roomId), eq(schema.diaryEntry.private, false)))
    .orderBy(desc(schema.diaryEntry.createdAt))
    .limit(300)
    .all();
}

export function getDiary(roomId: string, id: string): DiaryRow | undefined {
  return db
    .select()
    .from(schema.diaryEntry)
    .where(and(eq(schema.diaryEntry.roomId, roomId), eq(schema.diaryEntry.id, id)))
    .get();
}
