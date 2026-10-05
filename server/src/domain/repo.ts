import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import type { CharDoc } from './character.ts';
import { parseDoc } from './charDoc.ts';

export type CharacterRow = typeof schema.character.$inferSelect;

export interface LoadedCharacter {
  row: CharacterRow;
  doc: CharDoc;
}

export function loadCharacter(roomId: string, id: string): LoadedCharacter | null {
  const r = db
    .select({ c: schema.character, s: schema.characterSecret })
    .from(schema.character)
    .innerJoin(schema.characterSecret, eq(schema.characterSecret.characterId, schema.character.id))
    .where(and(eq(schema.character.id, id), eq(schema.character.roomId, roomId)))
    .get();
  return r ? { row: r.c, doc: parseDoc(r.s.doc) } : null;
}

export function loadOwnedCharacter(roomId: string, memberId: string): LoadedCharacter | null {
  const r = db
    .select({ c: schema.character, s: schema.characterSecret })
    .from(schema.character)
    .innerJoin(schema.characterSecret, eq(schema.characterSecret.characterId, schema.character.id))
    .where(and(eq(schema.character.ownerMemberId, memberId), eq(schema.character.roomId, roomId)))
    .get();
  return r ? { row: r.c, doc: parseDoc(r.s.doc) } : null;
}

export function listCharacters(roomId: string): LoadedCharacter[] {
  return db
    .select({ c: schema.character, s: schema.characterSecret })
    .from(schema.character)
    .innerJoin(schema.characterSecret, eq(schema.characterSecret.characterId, schema.character.id))
    .where(eq(schema.character.roomId, roomId))
    .all()
    .map((r) => ({ row: r.c, doc: parseDoc(r.s.doc) }));
}

export function insertCharacter(
  row: Omit<CharacterRow, 'createdAt' | 'updatedAt'>,
  doc: CharDoc,
): void {
  const now = Date.now();
  db.transaction((tx) => {
    tx.insert(schema.character).values({ ...row, createdAt: now, updatedAt: now }).run();
    tx.insert(schema.characterSecret).values({ characterId: row.id, doc: JSON.stringify(doc), updatedAt: now }).run();
  });
}

export function saveDoc(id: string, doc: CharDoc, rowPatch: Partial<Pick<CharacterRow, 'name' | 'publicBio' | 'ownerMemberId'>> = {}): void {
  const now = Date.now();
  doc.updatedAt = now;
  db.transaction((tx) => {
    tx.update(schema.characterSecret).set({ doc: JSON.stringify(doc), updatedAt: now }).where(eq(schema.characterSecret.characterId, id)).run();
    tx.update(schema.character).set({ ...rowPatch, updatedAt: now }).where(eq(schema.character.id, id)).run();
  });
}
