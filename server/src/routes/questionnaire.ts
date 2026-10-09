import type { FastifyInstance } from 'fastify';
import { QuestionnaireAnswersSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { questionnaireForPlayer, questionnairesForGm, saveQuestionnaire } from '../domain/questionnaire.ts';
import { loadOwnedCharacter } from '../domain/repo.ts';
import { findGmLeak } from '../visibility/guard.ts';

// Анкета персонажа (этап 55): игрок — своя, пока нет персонажа; мастер — все.

export async function playerQuestionnaireRoutes(app: FastifyInstance) {
  app.get('/api/player/questionnaire', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    return questionnaireForPlayer(auth.room.id, auth.member.id);
  });
  app.post('/api/player/questionnaire', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    const b = QuestionnaireAnswersSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    if (findGmLeak(JSON.stringify(b.data))) return reply.code(400).send({ error: 'bad_request' });
    if (loadOwnedCharacter(auth.room.id, auth.member.id)) return reply.code(409).send({ error: 'has_character' });
    saveQuestionnaire(auth.room.id, auth.member.id, auth.member.name, b.data);
    return questionnaireForPlayer(auth.room.id, auth.member.id);
  });
}

export async function gmQuestionnaireRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.get('/api/gm/questionnaires', async (request) => questionnairesForGm(request.auth!.room.id));
}
