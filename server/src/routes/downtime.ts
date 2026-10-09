import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DowntimeDraftSchema, DowntimeResolveSchema, DowntimeWriteSchema } from '@zg/shared';
import { generateText, type ClaudeFailure } from '../ai/claude/client.ts';
import { requireGm } from '../auth/requireGm.ts';
import { getDowntime, listForGm, outcomePrompt, resolveDowntime, setDowntime, stateForPlayer } from '../domain/downtime.ts';
import { draftsAvailable } from '../domain/places.ts';
import { loadCharacter } from '../domain/repo.ts';
import { findGmLeak } from '../visibility/guard.ts';

// Дела между сессиями (этап 44). Игроку — своё дело и итог после разбора; мастеру — все дела.

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

async function requirePlayer(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) return reply.code(401).send({ error: 'unauthorized' });
  if (request.auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
}

export async function playerDowntimeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requirePlayer);

  app.get('/api/player/downtime', async (request) => stateForPlayer(request.auth!.room.id, request.auth!.member.id));

  app.post('/api/player/downtime', async (request, reply) => {
    const b = DowntimeWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    if (findGmLeak(JSON.stringify(b.data.text))) return reply.code(400).send({ error: 'bad_request' });
    const res = setDowntime(request.auth!.room.id, request.auth!.member.id, b.data);
    if (!res.ok) return reply.code(res.error === 'no_character' ? 404 : 409).send({ error: res.error });
    return res.state;
  });
}

export async function gmDowntimeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  app.get('/api/gm/downtime', async (request) => listForGm(request.auth!.room.id));

  app.post<{ Params: { id: string } }>('/api/gm/downtime/:id/resolve', async (request, reply) => {
    const b = DowntimeResolveSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const r = getDowntime(request.auth!.room.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    resolveDowntime(r, b.data.outcome);
    return listForGm(r.roomId);
  });

  // Черновик итога — в поле, не сохраняется.
  app.post<{ Params: { id: string } }>('/api/gm/downtime/:id/draft', async (request, reply) => {
    const b = DowntimeDraftSchema.safeParse(request.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const r = getDowntime(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    const lc = loadCharacter(roomId, r.characterId);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    if (!draftsAvailable(roomId)) return reply.code(403).send({ error: 'off', message: 'Черновики Claude выключены (нет ключа ANTHROPIC_API_KEY)' });
    const res = await generateText(outcomePrompt(lc.row, r, b.data.hint), true);
    if (!res.ok) {
      request.log.warn({ reason: res.reason }, 'claude: итог дела не получился');
      return reply.code(502).send({ error: 'claude_unavailable', message: FAILURE_TEXT[res.reason] });
    }
    request.log.info({ model: res.model, in: res.inputTokens, out: res.outputTokens }, 'claude: итог дела готов');
    const text = res.text
      .trim()
      .replace(/^["«]|["»]$/g, '')
      .slice(0, 4000);
    if (!text) return reply.code(502).send({ error: 'bad_draft', message: 'Ответ пустой, попробуйте ещё раз' });
    return { text };
  });
}
