import type { FastifyInstance } from 'fastify';
import { PlayerCharacterResponseSchema } from '@zg/shared';
import { loadOwnedCharacter } from '../domain/repo.ts';
import { projectForPlayer } from '../visibility/character.ts';

export async function playerRoutes(app: FastifyInstance) {
  // Только своя карточка: идентификатор персонажа игрок не передаёт вообще.
  app.get('/api/player/character', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    const lc = loadOwnedCharacter(auth.room.id, auth.member.id);
    return PlayerCharacterResponseSchema.parse({ character: lc ? projectForPlayer(lc) : null });
  });
}
