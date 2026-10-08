import { and, asc, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { LetterPlayerSchema, type GmLetter, type LetterPlayer, type LetterStatus } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { pushToGm, pushToMember } from '../push/send.ts';
import { publish } from '../realtime/publish.ts';
import { SUMMARY_LORE } from './data.ts';
import type { CharacterRow } from './repo.ts';

// Письма персонажам (этап 42). Единственное место, где письмо превращается в то, что видит игрок: letterForPlayer.
// Игроку уходят только доставленные письма; note_gm и deliver_at — никогда.

export type LetterRow = typeof schema.letter.$inferSelect;

export function letterForPlayer(r: LetterRow): LetterPlayer {
  return LetterPlayerSchema.parse({
    id: r.id,
    from: r.fromName,
    text: r.text,
    deliveredAt: r.deliveredAt ?? 0,
    readAt: r.readAt,
    reply: r.reply,
    repliedAt: r.repliedAt,
  });
}

const statusOf = (r: LetterRow): LetterStatus => (!r.deliveredAt ? 'scheduled' : r.repliedAt ? 'replied' : r.readAt ? 'read' : 'delivered');

function charInfo(roomId: string): Map<string, { name: string; owner: string | null; ownerName: string | null }> {
  const members = new Map(
    db
      .select({ id: schema.member.id, name: schema.member.name })
      .from(schema.member)
      .where(eq(schema.member.roomId, roomId))
      .all()
      .map((m) => [m.id, m.name]),
  );
  return new Map(
    db
      .select({ id: schema.character.id, name: schema.character.name, owner: schema.character.ownerMemberId })
      .from(schema.character)
      .where(eq(schema.character.roomId, roomId))
      .all()
      .map((c) => [c.id, { name: c.name, owner: c.owner, ownerName: c.owner ? (members.get(c.owner) ?? null) : null }]),
  );
}

export function letterForGm(r: LetterRow, chars = charInfo(r.roomId)): GmLetter {
  const c = chars.get(r.characterId);
  return {
    id: r.id,
    characterId: r.characterId,
    characterName: c?.name ?? '—',
    memberName: c?.ownerName ?? null,
    fromName: r.fromName,
    text: r.text,
    noteGm: r.noteGm,
    deliverAt: r.deliverAt,
    deliveredAt: r.deliveredAt,
    readAt: r.readAt,
    reply: r.reply,
    repliedAt: r.repliedAt,
    status: statusOf(r),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function getLetter(roomId: string, id: string): LetterRow | undefined {
  return db
    .select()
    .from(schema.letter)
    .where(and(eq(schema.letter.roomId, roomId), eq(schema.letter.id, id)))
    .get();
}

/** Игроку: доставленные письма его персонажа, новые сверху. Без персонажа — пусто. */
export function listOwnLetters(roomId: string, memberId: string): LetterRow[] {
  const c = db
    .select({ id: schema.character.id })
    .from(schema.character)
    .where(and(eq(schema.character.roomId, roomId), eq(schema.character.ownerMemberId, memberId)))
    .get();
  if (!c) return [];
  return db
    .select()
    .from(schema.letter)
    .where(and(eq(schema.letter.characterId, c.id), isNotNull(schema.letter.deliveredAt)))
    .orderBy(desc(schema.letter.deliveredAt))
    .all()
    .filter((r) => r.deliveredAt !== null);
}

export function listLettersForGm(roomId: string): GmLetter[] {
  const chars = charInfo(roomId);
  return db
    .select()
    .from(schema.letter)
    .where(eq(schema.letter.roomId, roomId))
    .orderBy(desc(schema.letter.updatedAt))
    .all()
    .map((r) => letterForGm(r, chars));
}

/** Владелец персонажа письма сейчас — ему уходят события и push. */
function ownerOf(r: LetterRow): string | null {
  return db.select({ o: schema.character.ownerMemberId }).from(schema.character).where(eq(schema.character.id, r.characterId)).get()?.o ?? null;
}

function notifyPlayer(r: LetterRow): void {
  const owner = ownerOf(r);
  if (owner && r.deliveredAt) publish(r.roomId, { kind: 'member', memberId: owner }, 'letters:changed', { letter: letterForPlayer(r) });
  publish(r.roomId, { kind: 'gm' }, 'gm:letters.changed', { characterId: r.characterId });
}

/** Доставить: отметить, сообщить игроку и мастеру, push владельцу. */
function deliver(r: LetterRow, now: number): LetterRow {
  const next = { ...r, deliveredAt: now, updatedAt: now };
  db.update(schema.letter).set({ deliveredAt: now, updatedAt: now }).where(eq(schema.letter.id, r.id)).run();
  notifyPlayer(next);
  const owner = ownerOf(next);
  if (owner) pushToMember(r.roomId, owner, { title: 'Письмо', body: `От ${r.fromName}`, url: '/?tab=diary', tag: `letter:${r.id}` });
  return next;
}

export function createLetter(roomId: string, w: { characterId: string; fromName: string; text: string; noteGm: string; deliverAt?: number }): LetterRow {
  const now = Date.now();
  const deliverAt = w.deliverAt && w.deliverAt > now ? w.deliverAt : now;
  const row: LetterRow = {
    id: newId(),
    roomId,
    characterId: w.characterId,
    fromName: w.fromName,
    text: w.text,
    noteGm: w.noteGm,
    deliverAt,
    deliveredAt: null,
    readAt: null,
    reply: '',
    repliedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.letter).values(row).run();
  if (deliverAt <= now) return deliver(row, now);
  publish(roomId, { kind: 'gm' }, 'gm:letters.changed', { characterId: row.characterId });
  return row;
}

/** До доставки правится всё; после — только заметка мастера (текст у игрока уже на руках). */
export function updateLetter(r: LetterRow, patch: { fromName?: string; text?: string; noteGm?: string; deliverAt?: number }): LetterRow {
  const now = Date.now();
  const allowed = r.deliveredAt ? { noteGm: patch.noteGm } : patch;
  const set: Partial<LetterRow> = { updatedAt: now };
  if (allowed.noteGm !== undefined) set.noteGm = allowed.noteGm;
  if (!r.deliveredAt) {
    if (patch.fromName !== undefined) set.fromName = patch.fromName;
    if (patch.text !== undefined) set.text = patch.text;
    if (patch.deliverAt !== undefined) set.deliverAt = Math.max(patch.deliverAt, now);
  }
  db.update(schema.letter).set(set).where(eq(schema.letter.id, r.id)).run();
  const next = { ...r, ...set };
  publish(r.roomId, { kind: 'gm' }, 'gm:letters.changed', { characterId: r.characterId });
  return next;
}

export function deleteLetter(r: LetterRow): void {
  db.delete(schema.letter).where(eq(schema.letter.id, r.id)).run();
  const owner = ownerOf(r);
  if (owner && r.deliveredAt) publish(r.roomId, { kind: 'member', memberId: owner }, 'letters:removed', { id: r.id });
  publish(r.roomId, { kind: 'gm' }, 'gm:letters.changed', { characterId: r.characterId });
}

export function markRead(r: LetterRow): LetterRow {
  if (r.readAt || !r.deliveredAt) return r;
  const now = Date.now();
  db.update(schema.letter).set({ readAt: now, updatedAt: now }).where(eq(schema.letter.id, r.id)).run();
  const next = { ...r, readAt: now, updatedAt: now };
  notifyPlayer(next);
  return next;
}

export function setReply(r: LetterRow, text: string): LetterRow {
  const now = Date.now();
  const repliedAt = text ? now : null;
  db.update(schema.letter)
    .set({ reply: text, repliedAt, readAt: r.readAt ?? now, updatedAt: now })
    .where(eq(schema.letter.id, r.id))
    .run();
  const next = { ...r, reply: text, repliedAt, readAt: r.readAt ?? now, updatedAt: now };
  notifyPlayer(next);
  if (text) {
    const name = db.select({ n: schema.character.name }).from(schema.character).where(eq(schema.character.id, r.characterId)).get()?.n ?? 'Персонаж';
    pushToGm(r.roomId, { title: 'Ответ на письмо', body: `${name} — ${r.fromName}`, url: '/gm/letters', tag: `letter-reply:${r.id}` });
  }
  return next;
}

/** Письма, чей срок настал, — доставить. Зовётся планировщиком. */
export function deliverDue(now = Date.now()): number {
  const due = db
    .select()
    .from(schema.letter)
    .where(and(isNull(schema.letter.deliveredAt), lte(schema.letter.deliverAt, now)))
    .orderBy(asc(schema.letter.deliverAt))
    .all();
  for (const r of due) deliver(r, now);
  return due.length;
}

const TICK_MS = 30_000;
let timer: ReturnType<typeof setInterval> | null = null;

/** Планировщик доставки: сразу при запуске и каждые 30 с. Ошибки доставки игру не останавливают. */
export function startLetterScheduler(log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): void {
  if (timer) return;
  const tick = () => {
    try {
      const n = deliverDue();
      if (n) log.info({ n }, 'letters: письма доставлены');
    } catch (err) {
      log.warn({ err }, 'letters: доставка не удалась');
    }
  };
  tick();
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
}

export function stopLetterScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Подсказка Claude для черновика письма: канон, имя и открытое описание персонажа, отправитель, подсказка мастера. */
export function letterPrompt(c: CharacterRow, fromName: string, hint: string): string {
  return [
    'Ты помогаешь мастеру настольной ролевой игры «Зеленогорье» писать письмо персонажу игрока от лица жителя этого мира.',
    `Канон мира: ${SUMMARY_LORE}`,
    `Получатель письма: ${c.name}.${c.publicBio.trim() ? ` О нём известно: ${c.publicBio.trim().slice(0, 1500)}` : ''}`,
    `Отправитель: ${fromName}.`,
    hint ? `Что должно быть в письме (подсказка мастера): ${hint}` : '',
    '',
    'Напиши письмо по-русски, от первого лица отправителя, в духе средневекового фэнтези этого мира: обращение, 2–4 коротких абзаца, подпись. Живо и по делу, без игровой механики, чисел и тайн, которых отправитель знать не может. Только текст письма, без заголовка и кавычек.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}
