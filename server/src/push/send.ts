import { and, eq } from 'drizzle-orm';
import webpush from 'web-push';
import { PushNoteSchema, type PushNote } from '@zg/shared';
import { config } from '../config.ts';
import { db, schema } from '../db/client.ts';
import { GmLeakError, findGmLeak } from '../visibility/guard.ts';

// Push-уведомления (этап 41). Единственное место отправки. Тело проходит PushNoteSchema и тот же предохранитель,
// что publish(): маркер мастерских данных в теле — ошибка, ничего не уходит. Отправка в фоне, отказы игру не останавливают.

type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
let log: Log = { info: () => {}, warn: () => {} };
let configured = false;
const FAILS_MAX = 5;

export function initPush(l: Log): void {
  log = l;
  if (config.push && !configured) {
    webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
    configured = true;
  }
  log.info({ enabled: pushEnabled() }, 'push: уведомления');
}

export const pushEnabled = (): boolean => config.push !== null;
export const pushPublicKey = (): string | null => config.push?.publicKey ?? null;

type SubRow = typeof schema.pushSubscription.$inferSelect;

async function deliver(rows: SubRow[], note: PushNote): Promise<void> {
  if (!configured || rows.length === 0) return;
  const payload = JSON.stringify(PushNoteSchema.parse(note));
  const leak = findGmLeak(payload);
  if (leak) throw new GmLeakError('push', leak);
  for (const r of rows) {
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload, { TTL: 6 * 3600, urgency: 'normal' });
      db.update(schema.pushSubscription).set({ lastOkAt: Date.now(), fails: 0 }).where(eq(schema.pushSubscription.id, r.id)).run();
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 — подписки больше нет (игрок выключил уведомления в системе или удалил приложение)
      if (status === 404 || status === 410 || r.fails + 1 >= FAILS_MAX) {
        db.delete(schema.pushSubscription).where(eq(schema.pushSubscription.id, r.id)).run();
        log.info({ status, label: r.label }, 'push: подписка удалена');
      } else {
        db.update(schema.pushSubscription)
          .set({ fails: r.fails + 1 })
          .where(eq(schema.pushSubscription.id, r.id))
          .run();
        log.warn({ status, fails: r.fails + 1 }, 'push: не доставлено');
      }
    }
  }
}

function fire(rows: SubRow[], note: PushNote): void {
  if (!pushEnabled()) return;
  deliver(rows, note).catch((err) => log.warn({ err }, 'push: отправка не удалась'));
}

const subsOf = (roomId: string, memberId: string) =>
  db
    .select()
    .from(schema.pushSubscription)
    .where(and(eq(schema.pushSubscription.roomId, roomId), eq(schema.pushSubscription.memberId, memberId)))
    .all();

const subsOfRole = (roomId: string, role: 'gm' | 'player') =>
  db
    .select({ s: schema.pushSubscription })
    .from(schema.pushSubscription)
    .innerJoin(schema.member, eq(schema.member.id, schema.pushSubscription.memberId))
    .where(and(eq(schema.pushSubscription.roomId, roomId), eq(schema.member.role, role)))
    .all()
    .map((x) => x.s);

/** Одному участнику (все его устройства). */
export function pushToMember(roomId: string, memberId: string, note: PushNote): void {
  fire(subsOf(roomId, memberId), note);
}

/** Мастеру комнаты. */
export function pushToGm(roomId: string, note: PushNote): void {
  fire(subsOfRole(roomId, 'gm'), note);
}

/** Всем игрокам комнаты. */
export function pushToPlayers(roomId: string, note: PushNote): void {
  fire(subsOfRole(roomId, 'player'), note);
}

/** Сколько устройств подписано у участника — ему самому (кнопка в шапке). */
export function pushCount(roomId: string, memberId: string): number {
  return subsOf(roomId, memberId).length;
}
