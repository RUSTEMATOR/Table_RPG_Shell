import type { FastifyInstance } from 'fastify';
import { requireGm } from '../auth/requireGm.ts';
import { listPresence } from '../realtime/presence.ts';

export async function gmPresenceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  // Активность игроков: в сети ли, какая вкладка, что делает, журнал. Только мастеру, только из памяти.
  app.get('/api/gm/presence', async (request) => ({ players: listPresence(request.auth!.room.id) }));
}
