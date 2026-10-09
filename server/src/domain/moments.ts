import { and, asc, eq } from 'drizzle-orm';
import { MOMENT_KIND_LABELS, TableMomentSchema, type GmMoment, type MomentKind, type MomentPlayer } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { pushToMember } from '../push/send.ts';
import { publish } from '../realtime/publish.ts';

// Памятные моменты (этап 47). Игроку и столу — вид, заголовок, пояснение; заметка мастера — нет.

export type MomentRow = typeof schema.moment.$inferSelect;

const kindOf = (k: string): MomentKind => (k in MOMENT_KIND_LABELS ? (k as MomentKind) : 'custom');

export function momentRows(characterId: string): MomentRow[] {
  return db.select().from(schema.moment).where(eq(schema.moment.characterId, characterId)).orderBy(asc(schema.moment.createdAt)).all();
}

export const momentsForPlayer = (characterId: string): MomentPlayer[] =>
  momentRows(characterId).map((r) => ({ id: r.id, kind: kindOf(r.kind), title: r.title, text: r.text, at: r.createdAt }));
export const momentsForGm = (characterId: string): GmMoment[] =>
  momentRows(characterId).map((r) => ({ id: r.id, kind: kindOf(r.kind), title: r.title, text: r.text, at: r.createdAt, noteGm: r.noteGm, rollId: r.rollId }));

export function getMoment(roomId: string, id: string): MomentRow | undefined {
  return db
    .select()
    .from(schema.moment)
    .where(and(eq(schema.moment.roomId, roomId), eq(schema.moment.id, id)))
    .get();
}

/** Персонаж по броску — для «Момент» с ленты. */
export function characterOfRoll(roomId: string, rollId: string): string | null {
  const r = db
    .select({ c: schema.roll.characterId })
    .from(schema.roll)
    .where(and(eq(schema.roll.roomId, roomId), eq(schema.roll.id, rollId)))
    .get();
  return r?.c ?? null;
}

/** Выдать момент: строка, push владельцу, плашка столу. Проекцию персонажа рассылает вызывающий (notifyCharacterChanged). */
export function awardMoment(
  roomId: string,
  c: { id: string; name: string; ownerMemberId: string | null },
  w: { kind: MomentKind; title: string; text: string; noteGm: string; rollId?: string },
): MomentRow {
  const now = Date.now();
  const row: MomentRow = { id: newId(), roomId, characterId: c.id, kind: w.kind, title: w.title, text: w.text, rollId: w.rollId ?? null, noteGm: w.noteGm, createdAt: now };
  db.insert(schema.moment).values(row).run();
  if (c.ownerMemberId) pushToMember(roomId, c.ownerMemberId, { title: 'Памятный момент', body: w.title, url: '/?tab=card', tag: `moment:${row.id}` });
  publish(roomId, { kind: 'table' }, 'table:moment', TableMomentSchema.parse({ character: c.name, kind: w.kind, title: w.title, at: now }));
  return row;
}

export function deleteMoment(r: MomentRow): void {
  db.delete(schema.moment).where(eq(schema.moment.id, r.id)).run();
}
