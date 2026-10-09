import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireGm } from '../auth/requireGm.ts';
import { search } from '../domain/search.ts';

// Поиск мастера (этап 54).
const Query = z.object({ q: z.string().max(200).default('') });

export async function gmSearchRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.get('/api/gm/search', async (request, reply) => {
    const p = Query.safeParse(request.query);
    if (!p.success) return reply.code(400).send({ error: 'bad_request' });
    return { hits: search(request.auth!.room.id, p.data.q) };
  });
}
