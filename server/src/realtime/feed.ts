import { and, desc, eq, gt } from 'drizzle-orm';
import type { AudienceKey, FeedEvent, RollGm, RollPublic } from '@zg/shared';
import { db, schema } from '../db/client.ts';
import type { AuthContext } from '../auth/sessions.ts';
import { GmLeakError, findGmLeak } from '../visibility/guard.ts';
import { publish, type Audience } from './publish.ts';

// Лента событий. Каждое событие пишется отдельно в каждую аудиторию со своим seq
// и сразу рассылается. Для игрока и стола payload — уже публичная проекция.

export type Delivery =
  | { aud: { kind: 'public' }; roll: RollPublic }
  | { aud: { kind: 'table' }; roll: RollPublic }
  | { aud: { kind: 'member'; memberId: string }; roll: RollPublic }
  | { aud: { kind: 'gm' }; roll: RollGm };

const audKey = (a: Audience): string => (a.kind === 'member' ? `member:${a.memberId}` : a.kind);

export function appendEvents(roomId: string, deliveries: Delivery[]): void {
  const now = Date.now();
  const written: { aud: Audience; ev: FeedEvent }[] = [];
  db.transaction((tx) => {
    for (const d of deliveries) {
      const key = audKey(d.aud);
      const payload = JSON.stringify(d.roll);
      if (d.aud.kind !== 'gm') {
        const reason = findGmLeak(payload);
        if (reason) throw new GmLeakError(`feed ${key}`, reason);
      }
      const last = tx
        .select({ seq: schema.event.seq })
        .from(schema.event)
        .where(and(eq(schema.event.roomId, roomId), eq(schema.event.audience, key)))
        .orderBy(desc(schema.event.seq))
        .limit(1)
        .get();
      const seq = (last?.seq ?? 0) + 1;
      tx.insert(schema.event).values({ roomId, audience: key, seq, type: 'roll', payload, createdAt: now }).run();
      written.push({ aud: d.aud, ev: { aud: d.aud.kind, seq, type: 'roll', roll: d.roll } });
    }
  });
  for (const w of written) publish(roomId, w.aud, 'feed:event', w.ev);
}

/** Аудитории участника: ключ в базе и ключ, который знает клиент. */
export function audiencesOf(auth: AuthContext): { key: string; aud: AudienceKey }[] {
  switch (auth.member.role) {
    case 'gm':
      return [
        { key: 'public', aud: 'public' },
        { key: 'gm', aud: 'gm' },
      ];
    case 'table':
      return [
        { key: 'public', aud: 'public' },
        { key: 'table', aud: 'table' },
      ];
    case 'player':
      return [
        { key: 'public', aud: 'public' },
        { key: `member:${auth.member.id}`, aud: 'member' },
      ];
  }
}

const SNAPSHOT = 50;
const MAX_CATCHUP = 200;

/** События после lastSeq по каждой аудитории; при большом отставании — снимок последних по всем. */
export function catchUp(auth: AuthContext, lastSeq: Partial<Record<AudienceKey, number>>): { reset: boolean; events: FeedEvent[] } {
  const roomId = auth.room.id;
  const auds = audiencesOf(auth).map((a) => {
    const head = db
      .select({ seq: schema.event.seq })
      .from(schema.event)
      .where(and(eq(schema.event.roomId, roomId), eq(schema.event.audience, a.key)))
      .orderBy(desc(schema.event.seq))
      .limit(1)
      .get();
    return { ...a, since: lastSeq[a.aud] ?? 0, top: head?.seq ?? 0 };
  });
  const fresh = auds.every((a) => a.since === 0);
  // Клиент «из будущего» (база восстановлена из бэкапа) или слишком отстал — снимок по всем аудиториям,
  // иначе после замены ленты у клиента пропадёт история остальных.
  const reset = !fresh && auds.some((a) => a.since > a.top || a.top - a.since > MAX_CATCHUP);
  const out: FeedEvent[] = [];
  for (const a of auds) {
    const base = and(eq(schema.event.roomId, roomId), eq(schema.event.audience, a.key));
    const rows =
      fresh || reset
        ? db.select().from(schema.event).where(base).orderBy(desc(schema.event.seq)).limit(SNAPSHOT).all().reverse()
        : db.select().from(schema.event).where(and(base, gt(schema.event.seq, a.since))).orderBy(schema.event.seq).all();
    for (const r of rows) out.push({ aud: a.aud, seq: r.seq, type: 'roll', roll: JSON.parse(r.payload) as RollPublic | RollGm });
  }
  return { reset: fresh || reset, events: out };
}
