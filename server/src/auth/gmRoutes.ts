import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { CreateMemberSchema, GmMemberSchema, InviteCreatedSchema } from '@zg/shared';
import { db, schema } from '../db/client.ts';
import { issueInvite } from './invites.ts';
import { requireGm } from './requireGm.ts';
import { newId } from './tokens.ts';

export async function gmRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  app.get('/api/gm/members', async (request) => {
    const rows = db.select().from(schema.member).where(eq(schema.member.roomId, request.auth!.room.id)).all();
    const now = Date.now();
    return rows.map((m) =>
      GmMemberSchema.parse({
        id: m.id,
        name: m.name,
        role: m.role,
        hasSecret: m.secretHash !== null,
        joined: m.inviteUsedAt !== null || m.secretHash !== null,
        invitePending: !!m.inviteTokenHash && !m.inviteUsedAt && (m.inviteExpiresAt ?? 0) > now,
        inviteExpiresAt: m.inviteExpiresAt,
      }),
    );
  });

  app.post('/api/gm/members', async (request, reply) => {
    const body = CreateMemberSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const id = newId();
    db.insert(schema.member)
      .values({ id, roomId: request.auth!.room.id, role: body.data.role, name: body.data.name, createdAt: Date.now() })
      .run();
    const invite = issueInvite(id);
    return InviteCreatedSchema.parse({ memberId: id, ...invite });
  });

  app.post<{ Params: { id: string } }>('/api/gm/members/:id/invite', async (request, reply) => {
    const m = db
      .select()
      .from(schema.member)
      .where(and(eq(schema.member.id, request.params.id), eq(schema.member.roomId, request.auth!.room.id)))
      .get();
    if (!m || m.role === 'gm') return reply.code(404).send({ error: 'not_found' });
    const invite = issueInvite(m.id);
    return InviteCreatedSchema.parse({ memberId: m.id, ...invite });
  });
}
