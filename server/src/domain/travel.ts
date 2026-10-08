import { and, desc, eq } from 'drizzle-orm';
import { routesFrom, type GmProposal, type MapId, type ProposalPublic, type Route } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { placeRows, roads, type PlaceRow } from './maps.ts';
import { listParties, movePartyTo, partyIdOfMember, type PartyRow } from './parties.ts';

// Путь и время в дороге (этап 28). Маршрут строится только по тому, что видят игроки: открытые дороги и открытые места.
// Поэтому путь отряда, который уходит игрокам и столу как анимация, никогда не проходит по скрытой дороге.

/** Маршрут от отряда до открытого места этой карты. null — этого отряда на этой карте нет. */
export function publicRoute(roomId: string, mapId: MapId, placeId: string, party: PartyRow | null): Route | null {
  const start = party && party.mapId === mapId ? { x: party.x, y: party.y } : null;
  if (!start) return null;
  const places = placeRows(roomId, mapId);
  const open = roads(mapId, places).filter((r) => r.open);
  const visible = places.filter((p) => p.visible).map((p) => ({ id: p.id, x: p.x, y: p.y }));
  return routesFrom(mapId, start, open, visible)(placeId);
}

/**
 * Отряд идёт в место: сразу оказывается там, путь — анимация у всех (4–12 с по длине). Если отряда нет на этой карте
 * или место скрыто, отряд просто переставляется (без пути — путь выдал бы скрытое).
 */
export function travelTo(roomId: string, party: PartyRow, mapId: MapId, place: PlaceRow): void {
  const route = place.visible ? publicRoute(roomId, mapId, place.id, party) : null;
  const to = { x: place.x, y: place.y };
  if (!route || route.units < 1) {
    movePartyTo(roomId, party, mapId, to, { path: [], ms: 0 });
    return;
  }
  const ms = Math.round(Math.min(12000, Math.max(4000, route.units * 14)));
  // путь прореживается: анимации хватает точки на ~4 единицы карты
  const path: [number, number][] = [];
  for (const q of route.path) {
    const last = path[path.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) >= 4) path.push([Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
  }
  path.push([to.x, to.y]);
  movePartyTo(roomId, party, mapId, to, { path: path.slice(0, 2000), ms });
}

// ---- предложения игроков ----

export type ProposalRow = typeof schema.mapProposal.$inferSelect;

/** Одно ожидающее предложение игрока на карте: новое заменяет прежнее. */
export function propose(roomId: string, memberId: string, mapId: MapId, place: PlaceRow, days: number): ProposalRow {
  const now = Date.now();
  db.delete(schema.mapProposal)
    .where(and(eq(schema.mapProposal.roomId, roomId), eq(schema.mapProposal.memberId, memberId), eq(schema.mapProposal.mapId, mapId), eq(schema.mapProposal.status, 'pending')))
    .run();
  const row: ProposalRow = { id: newId(), roomId, memberId, mapId, placeId: place.id, days, status: 'pending', createdAt: now, updatedAt: now };
  db.insert(schema.mapProposal).values(row).run();
  return row;
}

export function cancelProposal(roomId: string, memberId: string, mapId: MapId): void {
  db.delete(schema.mapProposal)
    .where(and(eq(schema.mapProposal.roomId, roomId), eq(schema.mapProposal.memberId, memberId), eq(schema.mapProposal.mapId, mapId), eq(schema.mapProposal.status, 'pending')))
    .run();
}

export function getProposal(roomId: string, id: string): ProposalRow | undefined {
  return db
    .select()
    .from(schema.mapProposal)
    .where(and(eq(schema.mapProposal.roomId, roomId), eq(schema.mapProposal.id, id)))
    .get();
}

/** Ожидающие предложения на карте от игроков того же отряда (этап 39), что и автор p, — вместе с p. */
export function sameParty(p: ProposalRow): ProposalRow[] {
  const party = partyIdOfMember(p.roomId, p.memberId);
  return db
    .select()
    .from(schema.mapProposal)
    .where(and(eq(schema.mapProposal.roomId, p.roomId), eq(schema.mapProposal.mapId, p.mapId), eq(schema.mapProposal.status, 'pending')))
    .all()
    .filter((x) => partyIdOfMember(p.roomId, x.memberId) === party);
}

export function decideProposal(p: ProposalRow, status: 'accepted' | 'declined'): void {
  // принятое — у остальных игроков этого отряда на этой карте ожидающие теряют смысл: отряд уже идёт
  const close = status === 'accepted' ? sameParty(p).filter((x) => x.id !== p.id) : [];
  const now = Date.now();
  db.update(schema.mapProposal).set({ status, updatedAt: now }).where(eq(schema.mapProposal.id, p.id)).run();
  for (const x of close) db.update(schema.mapProposal).set({ status: 'declined', updatedAt: now }).where(eq(schema.mapProposal.id, x.id)).run();
}

/** Своё последнее предложение игрока на карте — только если место всё ещё открыто. */
export function ownProposal(roomId: string, memberId: string, mapId: MapId): ProposalPublic | null {
  const r = db
    .select({ p: schema.mapProposal, name: schema.mapPlace.name, visible: schema.mapPlace.visible, kind: schema.mapPlace.kind })
    .from(schema.mapProposal)
    .innerJoin(schema.mapPlace, eq(schema.mapPlace.id, schema.mapProposal.placeId))
    .where(and(eq(schema.mapProposal.roomId, roomId), eq(schema.mapProposal.memberId, memberId), eq(schema.mapProposal.mapId, mapId)))
    .orderBy(desc(schema.mapProposal.updatedAt))
    .get();
  if (!r || !r.visible || r.kind === 'deleted') return null;
  return { placeId: r.p.placeId, placeName: r.name, status: r.p.status, days: r.p.days };
}

/** Мастеру: ожидающие и несколько последних решённых. */
export function gmProposals(roomId: string, mapId: MapId): GmProposal[] {
  const rows = db
    .select({ p: schema.mapProposal, place: schema.mapPlace.name, member: schema.member.name })
    .from(schema.mapProposal)
    .innerJoin(schema.mapPlace, eq(schema.mapPlace.id, schema.mapProposal.placeId))
    .innerJoin(schema.member, eq(schema.member.id, schema.mapProposal.memberId))
    .where(and(eq(schema.mapProposal.roomId, roomId), eq(schema.mapProposal.mapId, mapId)))
    .orderBy(desc(schema.mapProposal.updatedAt))
    .all();
  const chars = db
    .select({ id: schema.character.id, owner: schema.character.ownerMemberId, name: schema.character.name })
    .from(schema.character)
    .where(eq(schema.character.roomId, roomId))
    .all();
  const charOf = (memberId: string) => chars.find((c) => c.owner === memberId)?.name;
  // какой отряд поведёт — подпись нужна, только когда отрядов несколько
  const parties = listParties(roomId);
  const partyLabel = (memberId: string) => {
    if (parties.length < 2) return null;
    const q = parties.find((x) => x.id === partyIdOfMember(roomId, memberId));
    return (
      chars
        .filter((c) => q?.members.includes(c.id))
        .map((c) => c.name)
        .join(', ') || null
    );
  };
  const list = rows.map(({ p, place, member }) => ({
    id: p.id,
    mapId,
    placeId: p.placeId,
    placeName: place,
    who: charOf(p.memberId) ? `${charOf(p.memberId)} (${member})` : member,
    party: p.status === 'pending' ? partyLabel(p.memberId) : null,
    days: p.days,
    status: p.status,
    createdAt: p.createdAt,
  }));
  return [...list.filter((p) => p.status === 'pending'), ...list.filter((p) => p.status !== 'pending').slice(0, 5)];
}
