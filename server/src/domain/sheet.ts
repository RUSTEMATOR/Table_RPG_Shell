import { and, asc, eq } from 'drizzle-orm';
import type { GmSheetEntry, PlayerItem, PlayerSheetNote, SheetKind } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';

// Лист персонажа: снаряжение, состояния, связи. text_gm и невидимые записи — мастерские данные.

export type SheetRow = typeof schema.sheetEntry.$inferSelect;

/** Сколько записей листа может быть у персонажа: защита от бесконечного списка. */
export const SHEET_MAX = 200;

export function listSheet(characterId: string): SheetRow[] {
  return db
    .select()
    .from(schema.sheetEntry)
    .where(eq(schema.sheetEntry.characterId, characterId))
    .orderBy(asc(schema.sheetEntry.createdAt), asc(schema.sheetEntry.id))
    .all();
}

export function getSheetEntry(characterId: string, id: string): SheetRow | undefined {
  return db
    .select()
    .from(schema.sheetEntry)
    .where(and(eq(schema.sheetEntry.characterId, characterId), eq(schema.sheetEntry.id, id)))
    .get();
}

export function gmSheet(rows: SheetRow[]): GmSheetEntry[] {
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    text: r.text,
    textGm: r.textGm,
    visible: r.visible,
    byPlayer: r.updatedBy === 'player',
    updatedAt: r.updatedAt,
  }));
}

/** Только видимые записи и только публичные поля. Невидимые не оставляют ни записи, ни счётчика. */
export function playerSheet(characterId: string): { items: PlayerItem[]; conditions: PlayerSheetNote[]; relations: PlayerSheetNote[] } {
  const rows = listSheet(characterId).filter((r) => r.visible);
  const note = (r: SheetRow): PlayerSheetNote => ({ title: r.title, text: r.text });
  return {
    items: rows.filter((r) => r.kind === 'item').map((r) => ({ id: r.id, title: r.title, text: r.text })),
    conditions: rows.filter((r) => r.kind === 'condition').map(note),
    relations: rows.filter((r) => r.kind === 'relation').map(note),
  };
}

export function createSheetEntry(
  characterId: string,
  w: { kind: SheetKind; title: string; text: string; textGm: string; visible: boolean },
  by: 'gm' | 'player',
): SheetRow {
  const now = Date.now();
  const row: SheetRow = { id: newId(), characterId, ...w, updatedBy: by, createdAt: now, updatedAt: now };
  db.insert(schema.sheetEntry).values(row).run();
  return row;
}

export function updateSheetEntry(
  r: SheetRow,
  patch: Partial<Pick<SheetRow, 'kind' | 'title' | 'text' | 'textGm' | 'visible'>>,
  by: 'gm' | 'player',
): SheetRow {
  const next = { ...r, ...patch, updatedBy: by, updatedAt: Date.now() };
  db.update(schema.sheetEntry)
    .set({ ...patch, updatedBy: by, updatedAt: next.updatedAt })
    .where(eq(schema.sheetEntry.id, r.id))
    .run();
  return next;
}

export function deleteSheetEntry(r: SheetRow): void {
  db.delete(schema.sheetEntry).where(eq(schema.sheetEntry.id, r.id)).run();
}

export function sheetCount(characterId: string): number {
  return listSheet(characterId).length;
}
