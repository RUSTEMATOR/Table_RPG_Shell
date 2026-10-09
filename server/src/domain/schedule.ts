import { and, asc, eq, inArray } from 'drizzle-orm';
import { SchedulePlayerSchema, type GmSchedule, type GmSlot, type SchedulePlayer, type SlotPlayer, type VoteAnswer } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { pushToPlayers } from '../push/send.ts';
import { publish } from '../realtime/publish.ts';
import { memberNames } from './places.ts';

// Расписание и явка (этап 46). Единственное место, где слот превращается в то, что видит игрок: slotForPlayer.

export type SlotRow = typeof schema.gameSlot.$inferSelect;
type VoteRow = typeof schema.gameSlotVote.$inferSelect;

const fmt = (t: number) => new Date(t).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const ended = (s: SlotRow, now: number) => s.startsAt + s.durationMin * 60_000 < now;

function slots(roomId: string): SlotRow[] {
  return db.select().from(schema.gameSlot).where(eq(schema.gameSlot.roomId, roomId)).orderBy(asc(schema.gameSlot.startsAt)).all();
}
function votes(slotIds: string[]): VoteRow[] {
  return slotIds.length ? db.select().from(schema.gameSlotVote).where(inArray(schema.gameSlotVote.slotId, slotIds)).all() : [];
}

function slotForPlayer(s: SlotRow, vs: VoteRow[], names: Map<string, string>, memberId: string | null): SlotPlayer {
  const mine = vs.filter((v) => v.slotId === s.id);
  return {
    id: s.id,
    startsAt: s.startsAt,
    durationMin: s.durationMin,
    note: s.note,
    answers: mine.map((v) => ({ name: names.get(v.memberId) ?? 'игрок', answer: v.answer })),
    my: memberId ? (mine.find((v) => v.memberId === memberId)?.answer ?? null) : null,
  };
}

/** Прошедшие назначенные игры удаляются при чтении: расписание — про будущее. */
function live(roomId: string): SlotRow[] {
  const now = Date.now();
  const all = slots(roomId);
  const old = all.filter((s) => ended(s, now));
  if (old.length)
    db.delete(schema.gameSlot)
      .where(
        inArray(
          schema.gameSlot.id,
          old.map((s) => s.id),
        ),
      )
      .run();
  return all.filter((s) => !ended(s, now));
}

export function scheduleForPlayer(roomId: string, memberId: string): SchedulePlayer {
  const rows = live(roomId);
  const vs = votes(rows.map((s) => s.id));
  const names = memberNames(roomId);
  const planned = rows.find((s) => s.kind === 'planned');
  return SchedulePlayerSchema.parse({
    planned: planned ? slotForPlayer(planned, vs, names, memberId) : null,
    options: rows.filter((s) => s.kind === 'option').map((s) => slotForPlayer(s, vs, names, memberId)),
  });
}

export function scheduleForGm(roomId: string): GmSchedule {
  const rows = live(roomId);
  const vs = votes(rows.map((s) => s.id));
  const names = memberNames(roomId);
  const gm = (s: SlotRow): GmSlot => ({ ...slotForPlayer(s, vs, names, null), kind: s.kind, remindedDay: s.remindedDay, remindedHour: s.remindedHour, createdAt: s.createdAt });
  const planned = rows.find((s) => s.kind === 'planned');
  const players = db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.roomId, roomId), eq(schema.member.role, 'player')))
    .all();
  const answered = new Set(planned ? vs.filter((v) => v.slotId === planned.id).map((v) => v.memberId) : []);
  return {
    planned: planned ? gm(planned) : null,
    options: rows.filter((s) => s.kind === 'option').map(gm),
    silent: planned ? players.filter((p) => !answered.has(p.id)).map((p) => names.get(p.id) ?? 'игрок') : [],
  };
}

export function getSlot(roomId: string, id: string): SlotRow | undefined {
  return db
    .select()
    .from(schema.gameSlot)
    .where(and(eq(schema.gameSlot.roomId, roomId), eq(schema.gameSlot.id, id)))
    .get();
}

function notify(roomId: string): void {
  const players = db
    .select({ id: schema.member.id })
    .from(schema.member)
    .where(and(eq(schema.member.roomId, roomId), eq(schema.member.role, 'player')))
    .all();
  for (const m of players) publish(roomId, { kind: 'member', memberId: m.id }, 'schedule:changed', scheduleForPlayer(roomId, m.id));
  publish(roomId, { kind: 'gm' }, 'gm:schedule.changed');
}

export function addOption(roomId: string, w: { startsAt: number; durationMin: number; note: string }): SlotRow {
  const wasEmpty = live(roomId).filter((s) => s.kind === 'option').length === 0;
  const row: SlotRow = {
    id: newId(),
    roomId,
    kind: 'option',
    startsAt: w.startsAt,
    durationMin: w.durationMin,
    note: w.note,
    remindedDay: false,
    remindedHour: false,
    createdAt: Date.now(),
  };
  db.insert(schema.gameSlot).values(row).run();
  notify(roomId);
  if (wasEmpty) pushToPlayers(roomId, { title: 'Когда играем?', body: 'Мастер предлагает даты — проголосуй', url: '/?tab=diary', tag: 'schedule' });
  return row;
}

/** Назначить: вариант становится игрой, остальные варианты и прежняя назначенная удаляются; явка начинается заново. */
export function planSlot(s: SlotRow): SlotRow {
  const others = slots(s.roomId).filter((x) => x.id !== s.id);
  if (others.length)
    db.delete(schema.gameSlot)
      .where(
        inArray(
          schema.gameSlot.id,
          others.map((x) => x.id),
        ),
      )
      .run();
  db.delete(schema.gameSlotVote).where(eq(schema.gameSlotVote.slotId, s.id)).run();
  db.update(schema.gameSlot).set({ kind: 'planned', remindedDay: false, remindedHour: false }).where(eq(schema.gameSlot.id, s.id)).run();
  notify(s.roomId);
  pushToPlayers(s.roomId, { title: 'Игра назначена', body: fmt(s.startsAt), url: '/?tab=diary', tag: 'schedule' });
  return { ...s, kind: 'planned' };
}

export function deleteSlot(s: SlotRow): void {
  db.delete(schema.gameSlot).where(eq(schema.gameSlot.id, s.id)).run();
  notify(s.roomId);
  if (s.kind === 'planned') pushToPlayers(s.roomId, { title: 'Игра отменена', body: fmt(s.startsAt), url: '/?tab=diary', tag: 'schedule' });
}

export function vote(s: SlotRow, memberId: string, answer: VoteAnswer): void {
  const now = Date.now();
  db.insert(schema.gameSlotVote)
    .values({ id: newId(), slotId: s.id, memberId, answer, updatedAt: now })
    .onConflictDoUpdate({ target: [schema.gameSlotVote.slotId, schema.gameSlotVote.memberId], set: { answer, updatedAt: now } })
    .run();
  notify(s.roomId);
}

/** «Напомнить сейчас» — push всем игрокам о назначенной игре. */
export function remindNow(s: SlotRow): void {
  pushToPlayers(s.roomId, { title: 'Напоминание об игре', body: fmt(s.startsAt), url: '/?tab=diary', tag: 'schedule' });
}

/** Планировщик: за сутки и за час до назначенной игры — push. Возвращает число отправленных напоминаний. */
export function remindDue(now = Date.now()): number {
  let n = 0;
  const planned = db.select().from(schema.gameSlot).where(eq(schema.gameSlot.kind, 'planned')).all();
  for (const s of planned) {
    const left = s.startsAt - now;
    if (left <= 0) continue;
    if (!s.remindedDay && left <= 24 * 3600_000) {
      db.update(schema.gameSlot).set({ remindedDay: true }).where(eq(schema.gameSlot.id, s.id)).run();
      // ближе часа — хватит одного напоминания, часового
      if (left > 3600_000) {
        pushToPlayers(s.roomId, { title: 'Игра завтра', body: fmt(s.startsAt), url: '/?tab=diary', tag: 'schedule' });
        n++;
      }
    }
    if (!s.remindedHour && left <= 3600_000) {
      db.update(schema.gameSlot).set({ remindedHour: true }).where(eq(schema.gameSlot.id, s.id)).run();
      pushToPlayers(s.roomId, { title: 'Игра через час', body: fmt(s.startsAt), url: '/?tab=diary', tag: 'schedule' });
      n++;
    }
  }
  return n;
}

/** Файл календаря: один VEVENT. */
export function icsFor(s: SlotRow, roomName: string): string {
  const stamp = (t: number) =>
    new Date(t)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zelenogorye//RU',
    'BEGIN:VEVENT',
    `UID:${s.id}@zelenogorye`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(s.startsAt)}`,
    `DTEND:${stamp(s.startsAt + s.durationMin * 60_000)}`,
    `SUMMARY:${esc(`Зеленогорье — игра (${roomName})`)}`,
    ...(s.note ? [`DESCRIPTION:${esc(s.note)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
