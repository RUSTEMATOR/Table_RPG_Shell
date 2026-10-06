import { and, eq } from 'drizzle-orm';
import { FigureSchema, RollPublicSchema, type Effect, type Figure, type RollGm, type RollPublic, type RollVisibility } from '@zg/shared';
import type { AuthContext } from '../auth/sessions.ts';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { appendEvents, type Delivery } from '../realtime/feed.ts';
import { powerBand, powerOf } from './cards.ts';
import { loadCharacter, loadOwnedCharacter } from './repo.ts';
import { resolveRoll } from './rolls.ts';
import { activeSession } from './session.ts';
import { greenForRollInBackground } from '../ai/jev/integrations.ts';

export type RollRow = typeof schema.roll.$inferSelect;

export function rollPublic(r: RollRow, who: string, figure?: Figure | null): RollPublic {
  return RollPublicSchema.parse({
    id: r.id,
    at: r.createdAt,
    who,
    ...(r.characterName ? { character: r.characterName } : {}),
    kind: r.kind,
    value: r.value,
    effect: r.effect as Effect,
    ...(r.label ? { label: r.label } : {}),
    private: r.visibility !== 'public',
    corrected: r.corrected,
    ...(figure ? { figure } : {}),
  });
}

/** Фигурка персонажа броска — для боя на столе. Внешность, не мастерские данные; битое описание — как будто фигурки нет. */
function rollFigure(r: RollRow): Figure | null {
  if (r.visibility !== 'public' || !r.characterId || r.corrected) return null;
  const f = FigureSchema.safeParse(loadCharacter(r.roomId, r.characterId)?.doc.figure);
  return f.success ? f.data : null;
}

export function rollGm(r: RollRow, who: string): RollGm {
  return {
    id: r.id,
    at: r.createdAt,
    who,
    memberId: r.memberId,
    ...(r.characterName ? { character: r.characterName } : {}),
    kind: r.kind,
    value: r.value,
    visibility: r.visibility,
    ...(r.label ? { label: r.label } : {}),
    outcome: r.outcome as Effect,
    effect: r.effect as Effect,
    ruleText: r.ruleText,
    myPower: r.myPower,
    myBand: powerBand(r.myPower).label,
    ...(r.enemyName ? { enemyName: r.enemyName } : {}),
    ...(r.enemyPower ? { enemyPower: r.enemyPower, enemyBand: powerBand(r.enemyPower).label } : {}),
    corrected: r.corrected,
    ...(r.correctionNote ? { correctionNote: r.correctionNote } : {}),
  };
}

function memberName(id: string): string {
  return db.select({ n: schema.member.name }).from(schema.member).where(eq(schema.member.id, id)).get()?.n ?? '';
}

function deliveries(r: RollRow): Delivery[] {
  const who = memberName(r.memberId);
  const out: Delivery[] = [{ aud: { kind: 'gm' }, roll: rollGm(r, who) }];
  if (r.visibility === 'public') out.push({ aud: { kind: 'public' }, roll: rollPublic(r, who, rollFigure(r)) });
  if (r.visibility === 'gm_and_me') out.push({ aud: { kind: 'member', memberId: r.memberId }, roll: rollPublic(r, who) });
  return out;
}

/** Ответ автору броска: мастеру — полная версия, игроку — публичная. */
export function rollFor(auth: AuthContext, r: RollRow): RollPublic | RollGm {
  const who = memberName(r.memberId);
  return auth.member.role === 'gm' ? rollGm(r, who) : rollPublic(r, who);
}

export const ALLOWED_VISIBILITY: Record<'gm' | 'player', RollVisibility[]> = {
  gm: ['public', 'gm_hidden'],
  player: ['public', 'gm_and_me'],
};

export function createRoll(auth: AuthContext, req: { clientRequestId: string; kind: 'd10' | 'd20'; visibility: RollVisibility; label: string }): RollRow {
  const roomId = auth.room.id;
  // Повтор того же запроса (двойное нажатие, переотправка после обрыва) — тот же бросок.
  const dup = db
    .select()
    .from(schema.roll)
    .where(and(eq(schema.roll.memberId, auth.member.id), eq(schema.roll.clientRequestId, req.clientRequestId)))
    .get();
  if (dup) return dup;

  const session = activeSession(roomId);
  const isGm = auth.member.role === 'gm';
  const owned = isGm ? null : loadOwnedCharacter(roomId, auth.member.id);
  const myPower = owned ? powerOf(owned.doc) : 10;
  const enemy = isGm ? null : session.opponentPower;
  const res = resolveRoll(req.kind, myPower, enemy);
  const row: RollRow = {
    id: newId(),
    roomId,
    sessionId: session.id,
    memberId: auth.member.id,
    characterId: owned?.row.id ?? null,
    characterName: owned?.row.name ?? null,
    kind: req.kind,
    value: res.value,
    visibility: req.visibility,
    label: req.label,
    outcome: res.outcome,
    effect: res.effect,
    ruleText: isGm ? 'Бросок мастера: сила не учитывается.' : res.ruleText,
    myPower,
    enemyName: !isGm && session.opponentName ? session.opponentName : null,
    enemyPower: enemy,
    corrected: false,
    correctionNote: null,
    clientRequestId: req.clientRequestId,
    createdAt: Date.now(),
  };
  db.insert(schema.roll).values(row).run();
  appendEvents(roomId, deliveries(row));
  if (!isGm) greenForRollInBackground(roomId, row);
  return row;
}

export function overrideRoll(roomId: string, rollId: string, effect: Effect, note: string): RollRow | null {
  const r = db
    .select()
    .from(schema.roll)
    .where(and(eq(schema.roll.id, rollId), eq(schema.roll.roomId, roomId)))
    .get();
  if (!r) return null;
  const next: RollRow = { ...r, effect, corrected: true, correctionNote: note || null };
  db.update(schema.roll)
    .set({ effect, corrected: true, correctionNote: note || null })
    .where(eq(schema.roll.id, r.id))
    .run();
  appendEvents(roomId, deliveries(next));
  return next;
}
