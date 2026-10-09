import type { FastifyInstance } from 'fastify';
import { BattleCreateSchema, BattlePatchSchema, BattleResponseSchema, PlayerMoveSchema, BattleTokenAddSchema, BattleTokenPatchSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { addToken, battleFor, battleForGm, createBattle, deleteToken, endBattle, getToken, patchBattle, patchToken, playerMove } from '../domain/battle.ts';

// Тактическое поле боя (этап 60). Мастер — всё; игрок и стол — открытое поле без скрытых фишек.

export async function gmBattleRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.get('/api/gm/battle', async (request) => ({ battle: battleForGm(request.auth!.room.id) }));
  app.post('/api/gm/battle', async (request, reply) => {
    const b = BattleCreateSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    createBattle(request.auth!.room.id, b.data);
    return { battle: battleForGm(request.auth!.room.id) };
  });
  app.post('/api/gm/battle/patch', async (request, reply) => {
    const b = BattlePatchSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    if (!patchBattle(request.auth!.room.id, b.data)) return reply.code(404).send({ error: 'no_battle' });
    return { battle: battleForGm(request.auth!.room.id) };
  });
  app.post('/api/gm/battle/end', async (request) => {
    endBattle(request.auth!.room.id);
    return { battle: null };
  });
  app.post('/api/gm/battle/tokens', async (request, reply) => {
    const b = BattleTokenAddSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const res = addToken(request.auth!.room.id, b.data);
    if (res !== 'ok') return reply.code(res === 'no_battle' ? 404 : 400).send({ error: res });
    return { battle: battleForGm(request.auth!.room.id) };
  });
  app.post<{ Params: { id: string } }>('/api/gm/battle/tokens/:id', async (request, reply) => {
    const b = BattleTokenPatchSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const t = getToken(request.auth!.room.id, request.params.id);
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (patchToken(t, b.data) !== 'ok') return reply.code(409).send({ error: 'bad_cell' });
    return { battle: battleForGm(request.auth!.room.id) };
  });
  app.post<{ Params: { id: string } }>('/api/gm/battle/tokens/:id/delete', async (request, reply) => {
    const t = getToken(request.auth!.room.id, request.params.id);
    if (!t) return reply.code(404).send({ error: 'not_found' });
    deleteToken(t);
    return { battle: battleForGm(request.auth!.room.id) };
  });
}

export async function publicBattleRoutes(app: FastifyInstance) {
  app.get('/api/player/battle', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    return BattleResponseSchema.parse({ battle: battleFor(auth.room.id, auth.member.id) });
  });
  app.post('/api/player/battle/move', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    const b = PlayerMoveSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const res = playerMove(auth.room.id, auth.member.id, b.data.col, b.data.row);
    if (res !== 'ok') return reply.code(409).send({ error: res });
    return BattleResponseSchema.parse({ battle: battleFor(auth.room.id, auth.member.id) });
  });
  app.get('/api/table/battle', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'table') return reply.code(403).send({ error: 'forbidden' });
    return BattleResponseSchema.parse({ battle: battleFor(auth.room.id, null) });
  });
}
