import type { FastifyInstance } from 'fastify';
import { HumanFigureSchema, PlayerCharacterResponseSchema } from '@zg/shared';
import { portraitBytes } from '../domain/portrait.ts';
import { loadCharacter, loadOwnedCharacter, saveDoc } from '../domain/repo.ts';
import { notifyCharacterChanged } from '../realtime/notify.ts';
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

  // Фигурка своего персонажа (этап 23): игрок собирает её сам. Описание проверяется схемой целиком; существо (этап 33) — только у противников.
  app.post('/api/player/character/figure', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    const b = HumanFigureSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const lc = loadOwnedCharacter(auth.room.id, auth.member.id);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    lc.doc.figure = b.data;
    saveDoc(lc.row.id, lc.doc);
    const fresh = loadOwnedCharacter(auth.room.id, auth.member.id)!;
    notifyCharacterChanged(auth.room.id, fresh);
    return PlayerCharacterResponseSchema.parse({ character: projectForPlayer(fresh) });
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
