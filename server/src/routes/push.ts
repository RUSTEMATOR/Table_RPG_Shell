import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { PushKeyResponseSchema, PushSubscribeSchema, PushUnsubscribeSchema } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { pushEnabled, pushPublicKey } from '../push/send.ts';

// Подписка на push (этап 41): игрок и мастер, со своих устройств. Стол не подписывается.

export async function pushRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: 'unauthorized' });
    if (request.auth.member.role === 'table') return reply.code(403).send({ error: 'forbidden' });
  });

  app.get('/api/push/key', async () => PushKeyResponseSchema.parse({ enabled: pushEnabled(), key: pushPublicKey() }));

  app.post('/api/push/subscribe', async (request, reply) => {
    if (!pushEnabled()) return reply.code(503).send({ error: 'push_disabled' });
    const b = PushSubscribeSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const { room, member } = request.auth!;
    const now = Date.now();
    // endpoint уникален на устройство: тот же endpoint → та же подписка, даже если вход сменился
    db.insert(schema.pushSubscription)
      .values({
        id: newId(),
        roomId: room.id,
        memberId: member.id,
        endpoint: b.data.endpoint,
        p256dh: b.data.keys.p256dh,
        auth: b.data.keys.auth,
        label: b.data.label,
        createdAt: now,
        lastOkAt: null,
        fails: 0,
      })
      .onConflictDoUpdate({
        target: schema.pushSubscription.endpoint,
        set: { roomId: room.id, memberId: member.id, p256dh: b.data.keys.p256dh, auth: b.data.keys.auth, label: b.data.label, fails: 0 },
      })
      .run();
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', async (request, reply) => {
    const b = PushUnsubscribeSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const { member } = request.auth!;
    db.delete(schema.pushSubscription)
      .where(and(eq(schema.pushSubscription.endpoint, b.data.endpoint), eq(schema.pushSubscription.memberId, member.id)))
      .run();
    return { ok: true };
  });
}
