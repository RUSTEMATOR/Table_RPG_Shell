import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { GmNote, GmPastNote } from '@zg/shared';
import { db, schema } from '../db/client.ts';

export function getNote(sessionId: string): GmNote {
  const r = db.select().from(schema.sessionNote).where(eq(schema.sessionNote.sessionId, sessionId)).get();
  return { sessionId, text: r?.text ?? '', updatedAt: r?.updatedAt ?? 0 };
}

/** Сохраняет, если никто не сохранил новее (две вкладки мастера). Иначе — конфликт. */
export function saveNote(sessionId: string, text: string, baseUpdatedAt: number): { ok: true; note: GmNote } | { ok: false; note: GmNote } {
  const cur = getNote(sessionId);
  if (cur.updatedAt !== baseUpdatedAt) return { ok: false, note: cur };
  const updatedAt = Math.max(Date.now(), cur.updatedAt + 1);
  db.insert(schema.sessionNote)
    .values({ sessionId, text, updatedAt })
    .onConflictDoUpdate({ target: schema.sessionNote.sessionId, set: { text, updatedAt } })
    .run();
  return { ok: true, note: { sessionId, text, updatedAt } };
}

/** Заметки завершённых сессий комнаты, новые сверху. Сессии без заметок пропускаются. */
export function pastNotes(roomId: string, limit = 50): GmPastNote[] {
  return db
    .select({
      sessionId: schema.gameSession.id,
      startedAt: schema.gameSession.startedAt,
      endedAt: schema.gameSession.endedAt,
      text: schema.sessionNote.text,
    })
    .from(schema.gameSession)
    .innerJoin(schema.sessionNote, eq(schema.sessionNote.sessionId, schema.gameSession.id))
    .where(and(eq(schema.gameSession.roomId, roomId), isNotNull(schema.gameSession.endedAt)))
    .orderBy(desc(schema.gameSession.startedAt))
    .limit(limit)
    .all()
    .filter((r) => r.text.trim() !== '')
    .map((r) => ({ ...r, endedAt: r.endedAt ?? r.startedAt }));
}
