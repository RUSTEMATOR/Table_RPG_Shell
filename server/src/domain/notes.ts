import { eq } from 'drizzle-orm';
import type { GmNote } from '@zg/shared';
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
