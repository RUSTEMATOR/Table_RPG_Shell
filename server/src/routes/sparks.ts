import type { FastifyInstance } from 'fastify';
import { SparkAwardSchema, SparksPlayerSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { loadCharacter, loadOwnedCharacter } from '../domain/repo.ts';
import { awardSpark, sparkBalance } from '../domain/sparks.ts';
import { characterView } from '../domain/views.ts';
import { notifyCharacterChanged } from '../realtime/notify.ts';

// Искры (этап 48). Игроку — только баланс своего персонажа; начисляет мастер. Трата — переброс в roll:request.

export async function playerSparkRoutes(app: FastifyInstance) {
  app.get('/api/player/sparks', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    const lc = loadOwnedCharacter(auth.room.id, auth.member.id);
    return SparksPlayerSchema.parse({ balance: lc ? sparkBalance(lc.row.id) : 0 });
  });
}

export async function gmSparkRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.post('/api/gm/sparks', async (request, reply) => {
    const b = SparkAwardSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, b.data.characterId);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    awardSpark(roomId, lc.row, 'award', b.data.reason);
    notifyCharacterChanged(roomId, lc);
    return characterView(lc);
  });
}
