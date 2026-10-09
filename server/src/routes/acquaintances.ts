import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AcquaintanceListPlayerSchema, AcquaintanceWriteSchema } from '@zg/shared';
import { getOwn, listForPlayer, updateOwn } from '../domain/acquaintances.ts';
import { findGmLeak } from '../visibility/guard.ts';

// Знакомые (этап 49): только игрок, только свои. Мастеру — через GmNpc.acquaintances (без заметок).

async function requirePlayer(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) return reply.code(401).send({ error: 'unauthorized' });
  if (request.auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
}

export async function playerAcquaintanceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requirePlayer);
  app.get('/api/player/acquaintances', async (request) => AcquaintanceListPlayerSchema.parse({ acquaintances: listForPlayer(request.auth!.room.id, request.auth!.member.id) }));
  app.post<{ Params: { id: string } }>('/api/player/acquaintances/:id', async (request, reply) => {
    const b = AcquaintanceWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    if (b.data.note !== undefined && findGmLeak(JSON.stringify(b.data.note))) return reply.code(400).send({ error: 'bad_request' });
    const { room, member } = request.auth!;
    const r = getOwn(room.id, member.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    updateOwn(r, b.data);
    return AcquaintanceListPlayerSchema.parse({ acquaintances: listForPlayer(room.id, member.id) });
  });
}
