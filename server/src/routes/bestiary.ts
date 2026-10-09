import type { FastifyInstance } from 'fastify';
import { BeastDraftSchema, BestiaryToggleSchema, FromSrdSchema } from '@zg/shared';
import { generateText, type ClaudeFailure } from '../ai/claude/client.ts';
import { draftsAvailable } from '../domain/places.ts';
import { SRD_ATTRIBUTION, beastPrompt, powerFromCr, srdGet, srdList, statblock } from '../domain/srd.ts';
import { publish } from '../realtime/publish.ts';
import { requireGm } from '../auth/requireGm.ts';
import { bestiaryChanged, bestiaryForPlayers, lockBeast, unlockBeast } from '../domain/bestiary.ts';
import { createNpc, getNpc, gmNpc } from '../domain/npc.ts';
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

const FAILURE_TEXT: Record<ClaudeFailure, string> = {
  no_key: 'Ключ Claude API не задан (ANTHROPIC_API_KEY).',
  auth: 'Claude API не принял ключ.',
  rate_limited: 'Claude API просит подождать: слишком много запросов.',
  timeout: 'Claude API не ответил вовремя.',
  network: 'Нет связи с Claude API.',
  refused: 'Модель отказалась писать этот текст.',
  too_long: 'Ответ не поместился, попробуйте ещё раз.',
  error: 'Claude API вернул ошибку.',
};

export async function gmBestiaryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  // справочник D&D SRD (шаг 5)
  app.get('/api/gm/bestiary-srd', async () => ({ attribution: SRD_ATTRIBUTION, monsters: srdList() }));

  app.post('/api/gm/npcs/from-srd', async (request, reply) => {
    const b = FromSrdSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const m = srdGet(b.data.slug);
    if (!m) return reply.code(404).send({ error: 'not_found' });
    const roomId = request.auth!.room.id;
    const r = createNpc(roomId, { name: m.name, power: powerFromCr(m.crNum), notes: statblock(m), bestiary: true, bestiaryText: '' });
    publish(roomId, { kind: 'gm' }, 'gm:npcs.changed');
    bestiaryChanged(roomId);
    const shown = db.select().from(schema.tableState).where(eq(schema.tableState.roomId, roomId)).get();
    return gmNpc(r, shown?.npcId ?? null, activeSession(roomId).opponentNpcId);
  });

  // описание для игроков — черновик Claude в поле
  app.post<{ Params: { id: string } }>('/api/gm/npcs/:id/bestiary-draft', async (request, reply) => {
    const b = BeastDraftSchema.safeParse(request.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const r = getNpc(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    if (!draftsAvailable(roomId)) return reply.code(403).send({ error: 'off', message: 'Черновики Claude выключены (нет ключа ANTHROPIC_API_KEY)' });
    const res = await generateText(beastPrompt(r, b.data.hint), true);
    if (!res.ok) {
      request.log.warn({ reason: res.reason }, 'claude: описание чудища не получилось');
      return reply.code(502).send({ error: 'claude_unavailable', message: FAILURE_TEXT[res.reason] });
    }
    request.log.info({ model: res.model, in: res.inputTokens, out: res.outputTokens }, 'claude: описание чудища готово');
    const text = res.text
      .trim()
      .replace(/^["«]|["»]$/g, '')
      .slice(0, 2000);
    if (!text) return reply.code(502).send({ error: 'bad_draft', message: 'Ответ пустой, попробуйте ещё раз' });
    return { text };
  });
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
