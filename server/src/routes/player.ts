import type { FastifyInstance } from 'fastify';
import { PlayerCharacterResponseSchema } from '@zg/shared';
import { portraitBytes } from '../domain/portrait.ts';
import { loadCharacter, loadOwnedCharacter } from '../domain/repo.ts';
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

  // Портрет: владельцу-игроку и мастеру комнаты. Остальным (другие игроки, стол) — 404, как будто портрета нет.
  app.get<{ Params: { id: string } }>('/api/characters/:id/portrait', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    const lc = loadCharacter(auth.room.id, request.params.id);
    const allowed = lc && (auth.member.role === 'gm' || (auth.member.role === 'player' && lc.row.ownerMemberId === auth.member.id));
    const img = allowed && lc.doc.image ? portraitBytes(lc.doc.image) : null;
    if (!img) return reply.code(404).send({ error: 'not_found' });
    return reply.header('content-type', img.type).header('cache-control', 'private, max-age=31536000, immutable').send(img.body);
  });
}
