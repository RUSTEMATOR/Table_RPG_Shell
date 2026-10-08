import { and, desc, eq, inArray } from 'drizzle-orm';
import type { GmPlayerPresence, GmPresenceLogEntry, PlayerAction, PlayerActivity, PlayerTab, PresenceStatus } from '@zg/shared';
import { db, schema } from '../db/client.ts';
import { getPlace } from '../domain/maps.ts';
import { publish } from './publish.ts';

// Активность игроков: только в памяти, только мастеру. После перезапуска пусто — игроки сообщат заново при переподключении.

const LOG_MAX = 30;
// Новый сокет без сообщения от клиента: подождать его первую активность, чтобы в журнале не было пустой строки.
const CONNECT_WAIT_MS = 1500;
// Последний сокет пропал: перезагрузка страницы или смена сети не должны давать «не в сети» в журнале.
const OFFLINE_GRACE_MS = 3000;

interface SocketState {
  visible: boolean;
  tab: PlayerTab | null;
  action: PlayerAction | null;
  placeName: string | null;
  at: number;
}

interface Shown {
  status: PresenceStatus;
  tab: PlayerTab | null;
  action: PlayerAction | null;
  placeName: string | null;
}

interface Entry {
  sockets: Map<string, SocketState>;
  shown: Shown | null;
  since: number | null;
  lastSeenAt: number | null;
  log: GmPresenceLogEntry[];
}

const rooms = new Map<string, Map<string, Entry>>();

function entry(roomId: string, memberId: string): Entry {
  let room = rooms.get(roomId);
  if (!room) rooms.set(roomId, (room = new Map()));
  let e = room.get(memberId);
  if (!e) room.set(memberId, (e = { sockets: new Map(), shown: null, since: null, lastSeenAt: null, log: [] }));
  return e;
}

/** Последний видимый сокет, иначе последний. */
function compute(e: Entry): Shown {
  let best: SocketState | null = null;
  for (const s of e.sockets.values()) {
    if (!best || (s.visible && !best.visible) || (s.visible === best.visible && s.at > best.at)) best = s;
  }
  if (!best) return { status: 'offline', tab: null, action: null, placeName: null };
  return { status: best.visible ? 'online' : 'hidden', tab: best.tab, action: best.action, placeName: best.placeName };
}

function recompute(roomId: string, memberId: string): void {
  const e = rooms.get(roomId)?.get(memberId);
  if (!e) return;
  const now = Date.now();
  const next = compute(e);
  if (next.status !== 'offline') e.lastSeenAt = now;
  if (e.shown && JSON.stringify(e.shown) === JSON.stringify(next)) return;
  e.shown = next;
  e.since = now;
  e.log = [{ at: now, ...next }, ...e.log].slice(0, LOG_MAX);
  const item = presenceItem(roomId, memberId);
  if (item) publish(roomId, { kind: 'gm' }, 'gm:presence.changed', item);
}

/** Название места этой комнаты; чужой или удалённый id — null. */
function placeName(roomId: string, placeId: string): string | null {
  const p = getPlace(roomId, placeId);
  return p && p.kind !== 'deleted' ? p.name || 'Без названия' : null;
}

export function presenceConnect(roomId: string, memberId: string, socketId: string): void {
  entry(roomId, memberId).sockets.set(socketId, { visible: true, tab: null, action: null, placeName: null, at: Date.now() });
  setTimeout(() => recompute(roomId, memberId), CONNECT_WAIT_MS);
}

export function presenceDisconnect(roomId: string, memberId: string, socketId: string): void {
  const e = rooms.get(roomId)?.get(memberId);
  if (!e) return;
  e.sockets.delete(socketId);
  if (e.sockets.size === 0) {
    e.lastSeenAt = Date.now();
    setTimeout(() => recompute(roomId, memberId), OFFLINE_GRACE_MS);
  } else recompute(roomId, memberId);
}

export function presenceUpdate(roomId: string, memberId: string, socketId: string, a: PlayerActivity): void {
  const e = rooms.get(roomId)?.get(memberId);
  if (!e?.sockets.has(socketId)) return;
  let action = a.action;
  let name: string | null = null;
  if (action && (action.kind === 'map.place' || action.kind === 'map.city')) {
    name = placeName(roomId, action.placeId);
    if (!name) action = null;
  }
  e.sockets.set(socketId, { visible: a.visible, tab: a.tab, action, placeName: name, at: Date.now() });
  recompute(roomId, memberId);
}

interface MemberInfo {
  name: string;
  characterId: string | null;
  characterName: string | null;
  sessionSeenAt: number | null;
}

function membersInfo(roomId: string, memberIds?: string[]): Map<string, MemberInfo> {
  const where = memberIds
    ? and(eq(schema.member.roomId, roomId), eq(schema.member.role, 'player'), inArray(schema.member.id, memberIds))
    : and(eq(schema.member.roomId, roomId), eq(schema.member.role, 'player'));
  const out = new Map<string, MemberInfo>();
  for (const m of db.select().from(schema.member).where(where).orderBy(schema.member.createdAt).all()) {
    out.set(m.id, { name: m.name, characterId: null, characterName: null, sessionSeenAt: null });
  }
  if (!out.size) return out;
  const ids = [...out.keys()];
  for (const c of db
    .select({ id: schema.character.id, name: schema.character.name, owner: schema.character.ownerMemberId })
    .from(schema.character)
    .where(and(eq(schema.character.roomId, roomId), inArray(schema.character.ownerMemberId, ids)))
    .orderBy(schema.character.createdAt)
    .all()) {
    const m = c.owner ? out.get(c.owner) : undefined;
    if (m && !m.characterId) Object.assign(m, { characterId: c.id, characterName: c.name });
  }
  for (const s of db
    .select({ memberId: schema.authSession.memberId, at: schema.authSession.lastSeenAt })
    .from(schema.authSession)
    .where(inArray(schema.authSession.memberId, ids))
    .orderBy(desc(schema.authSession.lastSeenAt))
    .all()) {
    const m = out.get(s.memberId);
    if (m && m.sessionSeenAt === null) m.sessionSeenAt = s.at;
  }
  return out;
}

function toItem(roomId: string, memberId: string, info: MemberInfo): GmPlayerPresence {
  const e = rooms.get(roomId)?.get(memberId);
  const shown = e?.shown ?? { status: 'offline' as const, tab: null, action: null, placeName: null };
  return {
    memberId,
    memberName: info.name,
    characterId: info.characterId,
    characterName: info.characterName,
    ...shown,
    since: e?.since ?? null,
    lastSeenAt: e?.lastSeenAt ?? info.sessionSeenAt,
    devices: e?.sockets.size ?? 0,
    log: e?.log ?? [],
  };
}

function presenceItem(roomId: string, memberId: string): GmPlayerPresence | null {
  const info = membersInfo(roomId, [memberId]).get(memberId);
  return info ? toItem(roomId, memberId, info) : null;
}

/** Все игроки комнаты, и не входившие. Только мастеру. */
export function listPresence(roomId: string): GmPlayerPresence[] {
  return [...membersInfo(roomId)].map(([id, info]) => toItem(roomId, id, info));
}
