import type { FastifyInstance } from 'fastify';
import { OpponentSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { getNpc } from '../domain/npc.ts';
import { activeSession, sessionView, setOpponent, startNewSession } from '../domain/session.ts';
import { publish } from '../realtime/publish.ts';

export async function gmSessionRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  app.get('/api/gm/session', async (request) => sessionView(activeSession(request.auth!.room.id)));

  // Противник сессии: его сила попадает в броски игроков. Игрокам не отправляется.
  app.post('/api/gm/session/opponent', async (request, reply) => {
    const b = OpponentSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    let s;
    if (b.data.npcId) {
      const n = getNpc(roomId, b.data.npcId);
      if (!n) return reply.code(404).send({ error: 'not_found' });
      s = setOpponent(roomId, n.name, n.power, n.id);
    } else s = setOpponent(roomId, b.data.name, b.data.power);
    publish(roomId, { kind: 'gm' }, 'gm:session.changed');
    publish(roomId, { kind: 'gm' }, 'gm:npcs.changed');
    return sessionView(s);
  });

  app.post('/api/gm/session/new', async (request) => {
    const roomId = request.auth!.room.id;
    const s = startNewSession(roomId);
    publish(roomId, { kind: 'gm' }, 'gm:session.changed');
    publish(roomId, { kind: 'gm' }, 'gm:npcs.changed');
    return sessionView(s);
  });
}
