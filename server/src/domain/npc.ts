import { and, asc, eq } from 'drizzle-orm';
import type { GmNpc } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { powerBand } from './cards.ts';
import { imageUrl, removeImage, storeImage } from './media.ts';

// Библиотека противников. Всё здесь — мастерские данные; столу уходит только projectForTable.

export type NpcRow = typeof schema.npc.$inferSelect;

export function gmNpc(r: NpcRow, shownId: string | null, opponentId: string | null): GmNpc {
  return {
    id: r.id,
    name: r.name,
    power: r.power,
    band: r.power ? powerBand(r.power).label : '',
    notes: r.notesGm,
    image: r.imageFile ? { url: imageUrl(r.imageFile), w: r.imageW ?? 0, h: r.imageH ?? 0, bytes: r.imageBytes ?? 0 } : null,
    shown: r.id === shownId,
    opponent: r.id === opponentId,
    updatedAt: r.updatedAt,
  };
}

export function listNpcs(roomId: string): NpcRow[] {
  return db.select().from(schema.npc).where(eq(schema.npc.roomId, roomId)).orderBy(asc(schema.npc.name)).all();
}

export function getNpc(roomId: string, id: string): NpcRow | undefined {
  return db
    .select()
    .from(schema.npc)
    .where(and(eq(schema.npc.roomId, roomId), eq(schema.npc.id, id)))
    .get();
}

export function createNpc(roomId: string, w: { name: string; power: number | null; notes: string }): NpcRow {
  const now = Date.now();
  const row: NpcRow = {
    id: newId(),
    roomId,
    name: w.name,
    power: w.power,
    notesGm: w.notes,
    imageFile: null,
    imageW: null,
    imageH: null,
    imageBytes: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.npc).values(row).run();
  return row;
}

export function updateNpc(r: NpcRow, w: { name: string; power: number | null; notes: string }): NpcRow {
  const patch = { name: w.name, power: w.power, notesGm: w.notes, updatedAt: Date.now() };
  db.update(schema.npc).set(patch).where(eq(schema.npc.id, r.id)).run();
  return { ...r, ...patch };
}

export async function setNpcImage(r: NpcRow, input: Buffer): Promise<NpcRow> {
  const img = await storeImage(input);
  removeImage(r.imageFile);
  const patch = { ...img, updatedAt: Date.now() };
  db.update(schema.npc).set(patch).where(eq(schema.npc.id, r.id)).run();
  return { ...r, ...patch };
}

export function deleteNpc(r: NpcRow): void {
  removeImage(r.imageFile);
  db.delete(schema.npc).where(eq(schema.npc.id, r.id)).run();
}
