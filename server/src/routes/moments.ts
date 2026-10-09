import type { FastifyInstance } from 'fastify';
import { MomentWriteSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { awardMoment, characterOfRoll, deleteMoment, getMoment } from '../domain/moments.ts';
import { awardSpark } from '../domain/sparks.ts';
import { loadCharacter } from '../domain/repo.ts';
import { characterView } from '../domain/views.ts';
import { notifyCharacterChanged } from '../realtime/notify.ts';

// Памятные моменты (этап 47): выдаёт и убирает только мастер; игроку момент приходит в карточке персонажа.

export async function gmMomentRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  app.post('/api/gm/moments', async (request, reply) => {
    const b = MomentWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const characterId = b.data.characterId ?? (b.data.rollId ? characterOfRoll(roomId, b.data.rollId) : null);
    if (!characterId) return reply.code(400).send({ error: 'no_character', message: 'У этого броска нет персонажа' });
    const lc = loadCharacter(roomId, characterId);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    awardMoment(roomId, lc.row, b.data);
    if (b.data.spark) awardSpark(roomId, lc.row, 'award', b.data.title);
    notifyCharacterChanged(roomId, lc);
    return characterView(lc);
  });

  app.post<{ Params: { id: string } }>('/api/gm/moments/:id/delete', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const r = getMoment(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    deleteMoment(r);
    const lc = loadCharacter(roomId, r.characterId);
    if (lc) notifyCharacterChanged(roomId, lc);
    return lc ? characterView(lc) : { ok: true };
  });
}
