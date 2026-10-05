import { and, eq, isNull } from 'drizzle-orm';
import type { GmSessionView } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { powerBand } from './cards.ts';

export type SessionRow = typeof schema.gameSession.$inferSelect;

/** Текущая сессия комнаты; если её нет — начинается новая. */
export function activeSession(roomId: string): SessionRow {
  const s = db
    .select()
    .from(schema.gameSession)
    .where(and(eq(schema.gameSession.roomId, roomId), isNull(schema.gameSession.endedAt)))
    .get();
  if (s) return s;
  const row: SessionRow = { id: newId(), roomId, startedAt: Date.now(), endedAt: null, opponentName: '', opponentPower: null };
  db.insert(schema.gameSession).values(row).run();
  return row;
}

export function sessionView(s: SessionRow): GmSessionView {
  return {
    id: s.id,
    startedAt: s.startedAt,
    opponentName: s.opponentName,
    opponentPower: s.opponentPower,
    opponentBand: s.opponentPower ? powerBand(s.opponentPower).label : '',
  };
}

export function setOpponent(roomId: string, name: string, power: number | null): SessionRow {
  const s = activeSession(roomId);
  db.update(schema.gameSession).set({ opponentName: name, opponentPower: power }).where(eq(schema.gameSession.id, s.id)).run();
  return { ...s, opponentName: name, opponentPower: power };
}

export function startNewSession(roomId: string): SessionRow {
  const s = activeSession(roomId);
  db.update(schema.gameSession).set({ endedAt: Date.now() }).where(eq(schema.gameSession.id, s.id)).run();
  return activeSession(roomId);
}
