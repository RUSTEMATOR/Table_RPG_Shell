import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { MAP_IDS, PARTY_MAIN, PARTY_MAX, type MapId, type PartyFigure, type PartyMove } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { getParty, partyMove, setParty, setPartyMove, type Piece } from './maps.ts';

// Отряды (этап 39): основной — map_party, отделившиеся — map_group. Персонаж игрока всегда ровно в одном отряде:
// кого нет в map_group_member, тот в основном. Отряд без персонажей (все ушли или удалены) исчезает, основной — нет.
// Персонажи без игрока в отряды не входят: ни в состав, ни в подписи.

export type PartyRow = { id: string; main: boolean; mapId: MapId; x: number; y: number; visible: boolean; move: string | null; members: string[] };

const mapOf = (id: string) => MAP_IDS.find((m) => m === id);

/** Персонажи игроков комнаты (id) — в порядке создания. */
function playerCharacters(roomId: string): string[] {
  return db
    .select({ id: schema.character.id })
    .from(schema.character)
    .where(and(eq(schema.character.roomId, roomId), isNotNull(schema.character.ownerMemberId)))
    .orderBy(asc(schema.character.createdAt))
    .all()
    .map((r) => r.id);
}

/** Все отряды комнаты: основной первым, затем отделившиеся по времени. Пустые отделившиеся стираются. */
export function listParties(roomId: string): PartyRow[] {
  const chars = playerCharacters(roomId);
  const links = db.select().from(schema.mapGroupMember).where(eq(schema.mapGroupMember.roomId, roomId)).all();
  const inGroup = new Map(links.filter((l) => chars.includes(l.characterId)).map((l) => [l.characterId, l.groupId]));
  const out: PartyRow[] = [];
  const main = getParty(roomId);
  const mainMap = main && mapOf(main.mapId);
  if (main && mainMap)
    out.push({ id: PARTY_MAIN, main: true, mapId: mainMap, x: main.x, y: main.y, visible: main.visible, move: main.move, members: chars.filter((c) => !inGroup.has(c)) });
  const groups = db.select().from(schema.mapGroup).where(eq(schema.mapGroup.roomId, roomId)).orderBy(asc(schema.mapGroup.createdAt)).all();
  for (const g of groups) {
    const members = chars.filter((c) => inGroup.get(c) === g.id);
    const mapId = mapOf(g.mapId);
    if (!members.length || !mapId) {
      db.delete(schema.mapGroup).where(eq(schema.mapGroup.id, g.id)).run();
      continue;
    }
    out.push({ id: g.id, main: false, mapId, x: g.x, y: g.y, visible: g.visible, move: g.move, members });
  }
  return out;
}

/** Отряд персонажа: id отделившегося или основной. */
export function partyIdOfCharacter(roomId: string, characterId: string): string {
  const l = db
    .select({ g: schema.mapGroupMember.groupId })
    .from(schema.mapGroupMember)
    .where(and(eq(schema.mapGroupMember.roomId, roomId), eq(schema.mapGroupMember.characterId, characterId)))
    .get();
  return l?.g ?? PARTY_MAIN;
}

/** Отряд игрока — отряд его персонажа; без персонажа — основной. */
export function partyIdOfMember(roomId: string, memberId: string): string {
  const c = db
    .select({ id: schema.character.id })
    .from(schema.character)
    .where(and(eq(schema.character.roomId, roomId), eq(schema.character.ownerMemberId, memberId)))
    .orderBy(asc(schema.character.createdAt))
    .get();
  return c ? partyIdOfCharacter(roomId, c.id) : PARTY_MAIN;
}

export function getPartyById(roomId: string, id: string): PartyRow | null {
  return listParties(roomId).find((p) => p.id === id) ?? null;
}

/** Фигурки отряда: персонажи с собранной фигуркой, по алфавиту (как pieces). */
export function figuresOf(all: Piece[], members: string[]): PartyFigure[] {
  return all.flatMap((p) => (p.kind === 'pc' && p.owner && p.figure && members.includes(p.refId) ? [{ name: p.name, figure: p.figure }] : [])).slice(0, 12);
}

/** Имена персонажей отряда, по алфавиту. */
export function namesOf(all: Piece[], members: string[]): string[] {
  return all.flatMap((p) => (p.kind === 'pc' && p.owner && p.name && members.includes(p.refId) ? [p.name] : [])).slice(0, 24);
}

/** Переставить отряд руками (без похода). false — такого отряда нет; основной создаётся при первой постановке. */
export function placeParty(roomId: string, id: string, v: { mapId: MapId; x: number; y: number; visible: boolean }): boolean {
  if (id === PARTY_MAIN) {
    setParty(roomId, v);
    return true;
  }
  const r = db
    .update(schema.mapGroup)
    .set({ ...v, move: null, updatedAt: Date.now() })
    .where(and(eq(schema.mapGroup.roomId, roomId), eq(schema.mapGroup.id, id)))
    .run();
  return r.changes > 0;
}

/** Отряд прошёл путь: сразу в конце пути, путь — для анимации у всех. */
export function movePartyTo(roomId: string, p: PartyRow, mapId: MapId, to: { x: number; y: number }, move: Omit<PartyMove, 'seq'>): void {
  if (p.main) {
    setPartyMove(roomId, mapId, to, move, p.visible);
    return;
  }
  const m: PartyMove = { ...move, seq: (partyMove(p)?.seq ?? 0) + 1 };
  db.update(schema.mapGroup)
    .set({ mapId, x: to.x, y: to.y, move: JSON.stringify(m), updatedAt: Date.now() })
    .where(eq(schema.mapGroup.id, p.id))
    .run();
}

export type SplitError = 'not_found' | 'not_member' | 'all' | 'too_many';

/** Разделить: от отряда from отходят персонажи ids — новый отряд в той же точке, с той же видимостью. */
export function splitParty(roomId: string, from: string, ids: string[]): { id: string } | { error: SplitError } {
  const parties = listParties(roomId);
  const src = parties.find((p) => p.id === from);
  if (!src) return { error: 'not_found' };
  const take = [...new Set(ids)];
  if (take.some((c) => !src.members.includes(c))) return { error: 'not_member' };
  if (take.length >= src.members.length) return { error: 'all' };
  if (parties.length >= PARTY_MAX) return { error: 'too_many' };
  const now = Date.now();
  const id = newId();
  db.transaction((tx) => {
    tx.insert(schema.mapGroup).values({ id, roomId, mapId: src.mapId, x: src.x, y: src.y, visible: src.visible, move: null, createdAt: now, updatedAt: now }).run();
    for (const characterId of take)
      tx.insert(schema.mapGroupMember)
        .values({ characterId, roomId, groupId: id })
        .onConflictDoUpdate({ target: schema.mapGroupMember.characterId, set: { groupId: id } })
        .run();
  });
  return { id };
}

/**
 * Соединить: отряд from вливается в into и встаёт на его место. Основной остаётся основным: если вливается он,
 * основной переходит в точку into, а into исчезает (его персонажи возвращаются в основной).
 */
export function mergeParties(roomId: string, from: string, into: string): boolean {
  const parties = listParties(roomId);
  const a = parties.find((p) => p.id === from);
  const b = parties.find((p) => p.id === into);
  if (!a || !b || a.id === b.id) return false;
  db.transaction((tx) => {
    if (b.main) tx.delete(schema.mapGroup).where(eq(schema.mapGroup.id, a.id)).run();
    else if (a.main) {
      tx.update(schema.mapParty).set({ mapId: b.mapId, x: b.x, y: b.y, visible: b.visible, move: null, updatedAt: Date.now() }).where(eq(schema.mapParty.roomId, roomId)).run();
      tx.delete(schema.mapGroup).where(eq(schema.mapGroup.id, b.id)).run();
    } else {
      tx.update(schema.mapGroupMember).set({ groupId: b.id }).where(eq(schema.mapGroupMember.groupId, a.id)).run();
      tx.delete(schema.mapGroup).where(eq(schema.mapGroup.id, a.id)).run();
    }
  });
  return true;
}
