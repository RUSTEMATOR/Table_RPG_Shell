import type { FastifyReply, FastifyRequest } from 'fastify';

/** Первая проверка любого мастерского маршрута. */
export async function requireGm(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) return reply.code(401).send({ error: 'unauthorized' });
  if (request.auth.member.role !== 'gm') {
    request.log.warn({ memberId: request.auth.member.id, url: request.url }, 'gm: запрос без роли мастера');
    return reply.code(403).send({ error: 'forbidden' });
  }
}
