import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { DOWNTIME_KIND_LABELS, DowntimeStatePlayerSchema, type DowntimeKind, type DowntimePlayer, type DowntimeStatePlayer, type GmDowntime } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { pushToMember } from '../push/send.ts';
import { publish } from '../realtime/publish.ts';
import { SUMMARY_LORE } from './data.ts';
import type { CharacterRow } from './repo.ts';
import { activeSession } from './session.ts';

// Дела между сессиями (этап 44). Единственное место, где дело превращается в то, что видит игрок: downtimeForPlayer.

export type DowntimeRow = typeof schema.downtime.$inferSelect;

const kindOf = (k: string): DowntimeKind => (k in DOWNTIME_KIND_LABELS ? (k as DowntimeKind) : 'other');

function downtimeForPlayer(r: DowntimeRow, currentSessionId: string): DowntimePlayer {
  return {
    id: r.id,
    kind: kindOf(r.kind),
    text: r.text,
    outcome: r.resolvedAt ? r.outcome : null,
    resolvedAt: r.resolvedAt,
    current: r.sessionId === currentSessionId,
    updatedAt: r.updatedAt,
  };
}

function ownCharacter(roomId: string, memberId: string) {
  return db
    .select({ id: schema.character.id })
    .from(schema.character)
    .where(and(eq(schema.character.roomId, roomId), eq(schema.character.ownerMemberId, memberId)))
    .get();
}

/** Игроку: дело текущей сессии и прошлое (неразобранное или последнее разобранное — чтобы увидеть итог). */
export function stateForPlayer(roomId: string, memberId: string): DowntimeStatePlayer {
  const c = ownCharacter(roomId, memberId);
  if (!c) return DowntimeStatePlayerSchema.parse({ current: null, previous: null });
  const session = activeSession(roomId);
  const rows = db
    .select()
    .from(schema.downtime)
    .where(and(eq(schema.downtime.roomId, roomId), eq(schema.downtime.characterId, c.id)))
    .orderBy(desc(schema.downtime.createdAt))
    .limit(5)
    .all();
  const current = rows.find((r) => r.sessionId === session.id) ?? null;
  const previous = rows.find((r) => r.sessionId !== session.id) ?? null;
  return DowntimeStatePlayerSchema.parse({
    current: current ? downtimeForPlayer(current, session.id) : null,
    previous: previous ? downtimeForPlayer(previous, session.id) : null,
  });
}

export function getDowntime(roomId: string, id: string): DowntimeRow | undefined {
  return db
    .select()
    .from(schema.downtime)
    .where(and(eq(schema.downtime.roomId, roomId), eq(schema.downtime.id, id)))
    .get();
}

function ownerOf(characterId: string): string | null {
  return db.select({ o: schema.character.ownerMemberId }).from(schema.character).where(eq(schema.character.id, characterId)).get()?.o ?? null;
}

function notify(r: DowntimeRow): void {
  const owner = ownerOf(r.characterId);
  if (owner) publish(r.roomId, { kind: 'member', memberId: owner }, 'downtime:changed', stateForPlayer(r.roomId, owner));
  publish(r.roomId, { kind: 'gm' }, 'gm:downtime.changed', { id: r.id });
}

/** Игрок выбирает или меняет дело текущей сессии; разобранное менять нельзя. */
export function setDowntime(
  roomId: string,
  memberId: string,
  w: { kind: DowntimeKind; text: string },
): { ok: true; state: DowntimeStatePlayer } | { ok: false; error: 'no_character' | 'resolved' } {
  const c = ownCharacter(roomId, memberId);
  if (!c) return { ok: false, error: 'no_character' };
  const session = activeSession(roomId);
  const now = Date.now();
  const cur = db
    .select()
    .from(schema.downtime)
    .where(and(eq(schema.downtime.sessionId, session.id), eq(schema.downtime.characterId, c.id)))
    .get();
  if (cur?.resolvedAt) return { ok: false, error: 'resolved' };
  let row: DowntimeRow;
  if (cur) {
    db.update(schema.downtime).set({ kind: w.kind, text: w.text, updatedAt: now }).where(eq(schema.downtime.id, cur.id)).run();
    row = { ...cur, kind: w.kind, text: w.text, updatedAt: now };
  } else {
    row = { id: newId(), roomId, sessionId: session.id, characterId: c.id, kind: w.kind, text: w.text, outcome: null, resolvedAt: null, createdAt: now, updatedAt: now };
    db.insert(schema.downtime).values(row).run();
  }
  notify(row);
  return { ok: true, state: stateForPlayer(roomId, memberId) };
}

export function listForGm(roomId: string): GmDowntime[] {
  const session = activeSession(roomId);
  const members = new Map(
    db
      .select({ id: schema.member.id, name: schema.member.name })
      .from(schema.member)
      .where(eq(schema.member.roomId, roomId))
      .all()
      .map((m) => [m.id, m.name]),
  );
  const chars = new Map(
    db
      .select({ id: schema.character.id, name: schema.character.name, owner: schema.character.ownerMemberId })
      .from(schema.character)
      .where(eq(schema.character.roomId, roomId))
      .all()
      .map((c) => [c.id, c]),
  );
  const sessions = new Map(
    db
      .select({ id: schema.gameSession.id, at: schema.gameSession.startedAt })
      .from(schema.gameSession)
      .where(eq(schema.gameSession.roomId, roomId))
      .all()
      .map((s) => [s.id, s.at]),
  );
  // неразобранные — все; разобранные — последние 30
  const open = db
    .select()
    .from(schema.downtime)
    .where(and(eq(schema.downtime.roomId, roomId), isNull(schema.downtime.resolvedAt)))
    .orderBy(asc(schema.downtime.createdAt))
    .all();
  const done = db
    .select()
    .from(schema.downtime)
    .where(and(eq(schema.downtime.roomId, roomId), isNotNull(schema.downtime.resolvedAt)))
    .orderBy(desc(schema.downtime.resolvedAt))
    .limit(30)
    .all();
  return [...open, ...done].map((r) => {
    const c = chars.get(r.characterId);
    return {
      id: r.id,
      sessionId: r.sessionId,
      sessionStartedAt: sessions.get(r.sessionId) ?? r.createdAt,
      current: r.sessionId === session.id,
      characterId: r.characterId,
      characterName: c?.name ?? '—',
      memberName: c?.owner ? (members.get(c.owner) ?? null) : null,
      kind: kindOf(r.kind),
      text: r.text,
      outcome: r.outcome,
      resolvedAt: r.resolvedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
}

/** Мастер разобрал дело: итог уходит игроку, push. Повторный разбор переписывает итог. */
export function resolveDowntime(r: DowntimeRow, outcome: string): DowntimeRow {
  const now = Date.now();
  const first = !r.resolvedAt;
  db.update(schema.downtime)
    .set({ outcome, resolvedAt: r.resolvedAt ?? now, updatedAt: now })
    .where(eq(schema.downtime.id, r.id))
    .run();
  const next = { ...r, outcome, resolvedAt: r.resolvedAt ?? now, updatedAt: now };
  notify(next);
  const owner = ownerOf(r.characterId);
  if (owner && first) pushToMember(r.roomId, owner, { title: 'Итог дела', body: DOWNTIME_KIND_LABELS[kindOf(r.kind)], url: '/?tab=diary', tag: `downtime:${r.id}` });
  return next;
}

/** Подсказка Claude для итога: канон, персонаж (имя, открытое описание), вид и текст дела, подсказка мастера. */
export function outcomePrompt(c: CharacterRow, r: DowntimeRow, hint: string): string {
  return [
    'Ты помогаешь мастеру настольной ролевой игры «Зеленогорье» подвести итог того, чем персонаж игрока занимался между сессиями.',
    `Канон мира: ${SUMMARY_LORE}`,
    `Персонаж: ${c.name}.${c.publicBio.trim() ? ` О нём известно: ${c.publicBio.trim().slice(0, 1500)}` : ''}`,
    `Дело: ${DOWNTIME_KIND_LABELS[kindOf(r.kind)]}.${r.text ? ` Игрок описал так: ${r.text}` : ''}`,
    hint ? `Как это должно кончиться (подсказка мастера): ${hint}` : 'Исход — правдоподобный, с небольшой зацепкой на будущее.',
    '',
    'Напиши по-русски итог для игрока: 2–4 предложения от лица рассказчика, в духе средневекового фэнтези этого мира, конкретно и живо. Без игровой механики и чисел. Только текст.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** Началась новая сессия: у игроков дело прошлой сессии стало «прошлым», можно выбрать новое. */
export function notifyDowntimeSessionChanged(roomId: string): void {
  const players = db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.roomId, roomId), eq(schema.member.role, 'player')))
    .all();
  for (const m of players) publish(roomId, { kind: 'member', memberId: m.id }, 'downtime:changed', stateForPlayer(roomId, m.id));
}
