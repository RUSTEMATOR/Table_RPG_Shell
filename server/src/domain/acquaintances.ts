import { and, desc, eq, inArray } from 'drizzle-orm';
import { AcquaintanceListPlayerSchema, type AcquaintancePlayer, type Attitude, type GmAcquaintance } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { publish } from '../realtime/publish.ts';
import { npcFigure } from './npc.ts';
import { presenceRows } from './places.ts';
import type { PlaceRow } from './maps.ts';

// Знакомые (этап 49). Единственное место, где знакомство превращается в то, что видит игрок: listForPlayer.
// Заметка игрока — только ему (мастеру не отдаётся, в ИИ не уходит).

export type AcqRow = typeof schema.acquaintance.$inferSelect;

function ownCharacter(roomId: string, memberId: string) {
  return db
    .select({ id: schema.character.id })
    .from(schema.character)
    .where(and(eq(schema.character.roomId, roomId), eq(schema.character.ownerMemberId, memberId)))
    .get();
}

/** Игрок внутри города увидел «Кто здесь»: по каждому открытому жителю — знакомство (новое или обновить lastAt). */
export function meetAt(roomId: string, memberId: string, p: PlaceRow): void {
  const c = ownCharacter(roomId, memberId);
  if (!c) return;
  const seen = presenceRows(p.id).filter(({ p: x }) => x.visible);
  if (!seen.length) return;
  const now = Date.now();
  let added = false;
  for (const { p: x } of seen) {
    const cur = db
      .select({ id: schema.acquaintance.id })
      .from(schema.acquaintance)
      .where(and(eq(schema.acquaintance.characterId, c.id), eq(schema.acquaintance.npcId, x.npcId)))
      .get();
    if (cur) db.update(schema.acquaintance).set({ lastAt: now }).where(eq(schema.acquaintance.id, cur.id)).run();
    else {
      db.insert(schema.acquaintance)
        .values({ id: newId(), roomId, characterId: c.id, npcId: x.npcId, firstPlaceId: p.id, firstAt: now, lastAt: now, attitude: 'unknown', note: '', updatedAt: now })
        .run();
      added = true;
    }
  }
  if (added) {
    publish(roomId, { kind: 'member', memberId }, 'acquaintances:changed', { acquaintances: listForPlayer(roomId, memberId) });
    publish(roomId, { kind: 'gm' }, 'gm:npcs.changed');
  }
}

export function listForPlayer(roomId: string, memberId: string): AcquaintancePlayer[] {
  const c = ownCharacter(roomId, memberId);
  if (!c) return [];
  const rows = db
    .select({ a: schema.acquaintance, name: schema.npc.name, figure: schema.npc.figure, place: schema.mapPlace.name })
    .from(schema.acquaintance)
    .innerJoin(schema.npc, eq(schema.npc.id, schema.acquaintance.npcId))
    .leftJoin(schema.mapPlace, eq(schema.mapPlace.id, schema.acquaintance.firstPlaceId))
    .where(eq(schema.acquaintance.characterId, c.id))
    .orderBy(desc(schema.acquaintance.lastAt))
    .all();
  // роль — из последней открытой записи «кто здесь» этого жителя
  const npcIds = rows.map((r) => r.a.npcId);
  const labels = new Map<string, string>();
  if (npcIds.length)
    for (const x of db
      .select({ npcId: schema.mapPresence.npcId, label: schema.mapPresence.label, at: schema.mapPresence.updatedAt })
      .from(schema.mapPresence)
      .where(and(eq(schema.mapPresence.roomId, roomId), eq(schema.mapPresence.visible, true), inArray(schema.mapPresence.npcId, npcIds)))
      .orderBy(desc(schema.mapPresence.updatedAt))
      .all())
      if (!labels.has(x.npcId) && x.label) labels.set(x.npcId, x.label);
  return AcquaintanceListPlayerSchema.parse({
    acquaintances: rows.map(({ a, name, figure, place }) => ({
      id: a.id,
      name,
      label: labels.get(a.npcId) ?? '',
      figure: npcFigure({ figure }),
      place: place ?? null,
      firstAt: a.firstAt,
      lastAt: a.lastAt,
      attitude: a.attitude as Attitude,
      note: a.note,
    })),
  }).acquaintances;
}

export function getOwn(roomId: string, memberId: string, id: string): AcqRow | undefined {
  const c = ownCharacter(roomId, memberId);
  if (!c) return undefined;
  return db
    .select()
    .from(schema.acquaintance)
    .where(and(eq(schema.acquaintance.id, id), eq(schema.acquaintance.characterId, c.id)))
    .get();
}

export function updateOwn(r: AcqRow, patch: { attitude?: Attitude; note?: string }): void {
  db.update(schema.acquaintance)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(schema.acquaintance.id, r.id))
    .run();
  if (patch.attitude !== undefined) publish(r.roomId, { kind: 'gm' }, 'gm:npcs.changed');
}

/** Мастеру у противника: кто знаком и как относится. Заметок игроков здесь нет. */
export function acquaintancesOfNpc(npcId: string): GmAcquaintance[] {
  return db
    .select({ a: schema.acquaintance, name: schema.character.name, place: schema.mapPlace.name })
    .from(schema.acquaintance)
    .innerJoin(schema.character, eq(schema.character.id, schema.acquaintance.characterId))
    .leftJoin(schema.mapPlace, eq(schema.mapPlace.id, schema.acquaintance.firstPlaceId))
    .where(eq(schema.acquaintance.npcId, npcId))
    .orderBy(desc(schema.acquaintance.firstAt))
    .all()
    .map(({ a, name, place }) => ({ characterName: name, attitude: a.attitude as Attitude, place: place ?? null, firstAt: a.firstAt }));
}
