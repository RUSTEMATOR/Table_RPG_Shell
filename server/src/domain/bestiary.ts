import { and, eq, sql } from 'drizzle-orm';
import { BestiaryPlayerSchema, type BestiaryPlayer } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { pushToPlayers } from '../push/send.ts';
import { publish } from '../realtime/publish.ts';
import { npcFigure, npcModel, type NpcRow } from './npc.ts';

// Бестиарий (этап 50). Единственное место, где чудище превращается в то, что видят игроки: bestiaryForPlayers.
// Уходят имя, фигурка, модель, описание для игроков, дата и число боёв; сила, заметки мастера и портрет — нет.

type UnlockRow = typeof schema.bestiaryUnlock.$inferSelect;

function fightsOf(roomId: string, npcId: string): number {
  const r = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.gameSession)
    .where(and(eq(schema.gameSession.roomId, roomId), eq(schema.gameSession.opponentNpcId, npcId)))
    .get();
  return Number(r?.n ?? 0);
}

function unlockOf(roomId: string, npcId: string): UnlockRow | undefined {
  return db
    .select()
    .from(schema.bestiaryUnlock)
    .where(and(eq(schema.bestiaryUnlock.roomId, roomId), eq(schema.bestiaryUnlock.npcId, npcId)))
    .get();
}

/** Для GmNpc. */
export function bestiaryInfo(r: NpcRow): { bestiary: boolean; bestiaryText: string; bestiaryUnlockedAt: number | null; fights: number } {
  return { bestiary: r.bestiary, bestiaryText: r.bestiaryText, bestiaryUnlockedAt: unlockOf(r.roomId, r.id)?.unlockedAt ?? null, fights: fightsOf(r.roomId, r.id) };
}

export function bestiaryForPlayers(roomId: string): BestiaryPlayer {
  const beasts = db
    .select()
    .from(schema.npc)
    .where(and(eq(schema.npc.roomId, roomId), eq(schema.npc.bestiary, true)))
    .all();
  const unlocks = new Map(
    db
      .select()
      .from(schema.bestiaryUnlock)
      .where(eq(schema.bestiaryUnlock.roomId, roomId))
      .all()
      .map((u) => [u.npcId, u]),
  );
  const entries = beasts
    .filter((b) => unlocks.has(b.id))
    .map((b) => ({
      id: b.id,
      name: b.name,
      figure: npcFigure(b),
      model3d: npcModel(b),
      text: b.bestiaryText,
      firstAt: unlocks.get(b.id)!.unlockedAt,
      fights: fightsOf(roomId, b.id),
    }))
    .sort((a, b) => a.firstAt - b.firstAt);
  return BestiaryPlayerSchema.parse({ entries, total: beasts.length });
}

function notify(roomId: string): void {
  const players = db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.roomId, roomId), eq(schema.member.role, 'player')))
    .all();
  const payload = bestiaryForPlayers(roomId);
  for (const m of players) publish(roomId, { kind: 'member', memberId: m.id }, 'bestiary:changed', payload);
  publish(roomId, { kind: 'gm' }, 'gm:npcs.changed');
}

/** Открыть чудище отряду. Не чудище (без флага) — ничего. true — открыли сейчас. */
export function unlockBeast(r: NpcRow, by: 'opponent' | 'gm'): boolean {
  if (!r.bestiary || unlockOf(r.roomId, r.id)) return false;
  db.insert(schema.bestiaryUnlock).values({ id: newId(), roomId: r.roomId, npcId: r.id, unlockedAt: Date.now(), by }).run();
  notify(r.roomId);
  pushToPlayers(r.roomId, { title: 'Бестиарий', body: r.name, url: '/?tab=chronicle', tag: `beast:${r.id}` });
  return true;
}

export function lockBeast(r: NpcRow): void {
  db.delete(schema.bestiaryUnlock)
    .where(and(eq(schema.bestiaryUnlock.roomId, r.roomId), eq(schema.bestiaryUnlock.npcId, r.id)))
    .run();
  notify(r.roomId);
}

/** Флаг или описание поменялись — игрокам обновить (описание открытого чудища, полнота). */
export const bestiaryChanged = (roomId: string) => notify(roomId);
