import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LetterDraftSchema, LetterListPlayerSchema, LetterPatchSchema, LetterReplySchema, LetterWriteSchema } from '@zg/shared';
import { generateText, type ClaudeFailure } from '../ai/claude/client.ts';
import { requireGm } from '../auth/requireGm.ts';
import {
  createLetter,
  deleteLetter,
  getLetter,
  letterForGm,
  letterForPlayer,
  letterPrompt,
  listLettersForGm,
  listOwnLetters,
  markRead,
  setReply,
  updateLetter,
} from '../domain/letters.ts';
import { draftsAvailable } from '../domain/places.ts';
import { loadCharacter } from '../domain/repo.ts';
import { findGmLeak } from '../visibility/guard.ts';

// Письма (этап 42). Игроку — только своего персонажа и только доставленные (listOwnLetters); мастеру — все.

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

export async function playerLetterRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requirePlayer);

  app.get('/api/player/letters', async (request) => LetterListPlayerSchema.parse({ letters: listOwnLetters(request.auth!.room.id, request.auth!.member.id).map(letterForPlayer) }));

  /** Своё доставленное письмо, иначе 404 (как несуществующее). */
  const own = (request: FastifyRequest<{ Params: { id: string } }>) => listOwnLetters(request.auth!.room.id, request.auth!.member.id).find((r) => r.id === request.params.id);

  app.post<{ Params: { id: string } }>('/api/player/letters/:id/read', async (request, reply) => {
    const r = own(request);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    return letterForPlayer(markRead(r));
  });

  app.post<{ Params: { id: string } }>('/api/player/letters/:id/reply', async (request, reply) => {
    const b = LetterReplySchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    if (findGmLeak(JSON.stringify(b.data.text))) return reply.code(400).send({ error: 'bad_request' });
    const r = own(request);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    return letterForPlayer(setReply(r, b.data.text));
  });
}

export async function gmLetterRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  app.get('/api/gm/letters', async (request) => listLettersForGm(request.auth!.room.id));

  app.post('/api/gm/letters', async (request, reply) => {
    const b = LetterWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    if (!loadCharacter(roomId, b.data.characterId)) return reply.code(404).send({ error: 'not_found' });
    return letterForGm(createLetter(roomId, b.data));
  });

  app.post<{ Params: { id: string } }>('/api/gm/letters/:id', async (request, reply) => {
    const b = LetterPatchSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const r = getLetter(request.auth!.room.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    return letterForGm(updateLetter(r, b.data));
  });

  app.post<{ Params: { id: string } }>('/api/gm/letters/:id/delete', async (request, reply) => {
    const r = getLetter(request.auth!.room.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    deleteLetter(r);
    return { ok: true };
  });

  // Черновик Claude: в поле, не сохраняется — правит и отправляет человек.
  app.post('/api/gm/letters/draft', async (request, reply) => {
    const b = LetterDraftSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, b.data.characterId);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    if (!draftsAvailable(roomId)) return reply.code(403).send({ error: 'off', message: 'Черновики Claude выключены (нет ключа или демо-комната)' });
    const res = await generateText(letterPrompt(lc.row, b.data.fromName, b.data.hint), true);
    if (!res.ok) {
      request.log.warn({ reason: res.reason }, 'claude: черновик письма не получился');
      return reply.code(502).send({ error: 'claude_unavailable', message: FAILURE_TEXT[res.reason] });
    }
    request.log.info({ model: res.model, in: res.inputTokens, out: res.outputTokens }, 'claude: черновик письма готов');
    const text = res.text
      .trim()
      .replace(/^["«]|["»]$/g, '')
      .slice(0, 8000);
    if (!text) return reply.code(502).send({ error: 'bad_draft', message: 'Ответ пустой, попробуйте ещё раз' });
    return { text };
  });
}
