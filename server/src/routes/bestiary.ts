import type { FastifyInstance } from 'fastify';
import { BestiaryToggleSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { bestiaryForPlayers, lockBeast, unlockBeast } from '../domain/bestiary.ts';
import { getNpc, gmNpc } from '../domain/npc.ts';
import { activeSession } from '../domain/session.ts';
import { db, schema } from '../db/client.ts';
import { eq } from 'drizzle-orm';

// Бестиарий (этап 50): игрокам — общая коллекция комнаты; мастер открывает и скрывает.

export async function playerBestiaryRoutes(app: FastifyInstance) {
  app.get('/api/player/bestiary', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    return bestiaryForPlayers(auth.room.id);
  });
}

export async function gmBestiaryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.post<{ Params: { id: string } }>('/api/gm/npcs/:id/bestiary', async (request, reply) => {
    const b = BestiaryToggleSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const r = getNpc(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    if (b.data.open && !r.bestiary) return reply.code(400).send({ error: 'not_beast', message: 'Сначала отметьте «В бестиарии»' });
    if (b.data.open) unlockBeast(r, 'gm');
    else lockBeast(r);
    const shown = db.select().from(schema.tableState).where(eq(schema.tableState.roomId, roomId)).get();
    return gmNpc(r, shown?.npcId ?? null, activeSession(roomId).opponentNpcId);
  });
}
