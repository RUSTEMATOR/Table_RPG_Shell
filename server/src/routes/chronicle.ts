import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ChapterAnswerSchema, ChapterDraftSchema, ChapterListPlayerSchema, ChapterPatchSchema, ChapterWriteSchema, PhotoCaptionSchema } from '@zg/shared';
import { IMAGE_BODY_LIMIT, IMAGE_TYPES } from '../domain/media.ts';
import { generateText, type ClaudeFailure } from '../ai/claude/client.ts';
import { requireGm } from '../auth/requireGm.ts';
import {
  addPhoto,
  captionPhoto,
  deletePhoto,
  getPhoto,
  answerQuiz,
  chapterForGm,
  chapterForPlayer,
  chapterPrompt,
  createChapter,
  deleteChapter,
  getChapter,
  listChaptersForGm,
  listPublished,
  listSessionsForGm,
  parseChapterDraft,
  parseQuizDraft,
  quizPrompt,
  sessionMaterial,
  setPublished,
  updateChapter,
} from '../domain/chronicle.ts';
import { draftsAvailable } from '../domain/places.ts';

// Летопись (этап 43). Игроку — только опубликованные главы (listPublished) и свой результат; мастеру — всё.

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

export async function playerChronicleRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requirePlayer);

  app.get('/api/player/chronicle', async (request) => {
    const { room, member } = request.auth!;
    return ChapterListPlayerSchema.parse({ chapters: listPublished(room.id).map((r) => chapterForPlayer(r, member.id)) });
  });

  app.post<{ Params: { id: string } }>('/api/player/chronicle/:id/answer', async (request, reply) => {
    const b = ChapterAnswerSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const { room, member } = request.auth!;
    const r = getChapter(room.id, request.params.id);
    if (!r || r.status !== 'published') return reply.code(404).send({ error: 'not_found' });
    const res = answerQuiz(r, member.id, b.data.answers);
    if (!res.ok) return reply.code(res.error === 'already' ? 409 : 400).send({ error: res.error });
    return res.chapter;
  });
}

export async function gmChronicleRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.addContentTypeParser(IMAGE_TYPES, { parseAs: 'buffer', bodyLimit: IMAGE_BODY_LIMIT }, (_req, body, done) => done(null, body));

  // фото сессии (этап 53)
  app.post<{ Params: { id: string } }>('/api/gm/chronicle/:id/photos', async (request, reply) => {
    const r = getChapter(request.auth!.room.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) return reply.code(400).send({ error: 'no_image' });
    let res;
    try {
      res = await addPhoto(r, request.body);
    } catch (err) {
      request.log.warn({ err }, 'chronicle: фото не обработалось');
      return reply.code(400).send({ error: 'bad_image', message: 'Не получилось прочитать картинку' });
    }
    if (res === 'too_many') return reply.code(409).send({ error: 'too_many', message: 'Не больше 24 фото в главе' });
    return chapterForGm(getChapter(r.roomId, r.id)!);
  });
  app.post<{ Params: { pid: string } }>('/api/gm/chronicle/photos/:pid', async (request, reply) => {
    const b = PhotoCaptionSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const p = getPhoto(request.auth!.room.id, request.params.pid);
    if (!p) return reply.code(404).send({ error: 'not_found' });
    captionPhoto(p, b.data.caption);
    return chapterForGm(getChapter(p.roomId, p.chapterId)!);
  });
  app.post<{ Params: { pid: string } }>('/api/gm/chronicle/photos/:pid/delete', async (request, reply) => {
    const p = getPhoto(request.auth!.room.id, request.params.pid);
    if (!p) return reply.code(404).send({ error: 'not_found' });
    deletePhoto(p);
    return chapterForGm(getChapter(p.roomId, p.chapterId)!);
  });

  app.get('/api/gm/chronicle', async (request) => listChaptersForGm(request.auth!.room.id));
  app.get('/api/gm/sessions', async (request) => listSessionsForGm(request.auth!.room.id));

  app.post('/api/gm/chronicle', async (request, reply) => {
    const b = ChapterWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    return chapterForGm(createChapter(request.auth!.room.id, b.data));
  });

  app.post<{ Params: { id: string } }>('/api/gm/chronicle/:id', async (request, reply) => {
    const b = ChapterPatchSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const r = getChapter(request.auth!.room.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    return chapterForGm(updateChapter(r, b.data));
  });

  app.post<{ Params: { id: string } }>('/api/gm/chronicle/:id/publish', async (request, reply) => {
    const b = (request.body ?? {}) as { on?: unknown };
    const r = getChapter(request.auth!.room.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    return chapterForGm(setPublished(r, b.on !== false));
  });

  app.post<{ Params: { id: string } }>('/api/gm/chronicle/:id/delete', async (request, reply) => {
    const r = getChapter(request.auth!.room.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    deleteChapter(r);
    return { ok: true };
  });

  // Черновик главы — в поле, не сохраняется; мастер правит и сохраняет сам.
  app.post('/api/gm/chronicle/draft', async (request, reply) => {
    const b = ChapterDraftSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    if (!draftsAvailable(roomId)) return reply.code(403).send({ error: 'off', message: 'Черновики Claude выключены (нет ключа ANTHROPIC_API_KEY)' });
    const res = await generateText(chapterPrompt(sessionMaterial(roomId, b.data.sessionId), b.data.hint), false);
    if (!res.ok) {
      request.log.warn({ reason: res.reason }, 'claude: глава не получилась');
      return reply.code(502).send({ error: 'claude_unavailable', message: FAILURE_TEXT[res.reason] });
    }
    request.log.info({ model: res.model, in: res.inputTokens, out: res.outputTokens }, 'claude: глава готова');
    const draft = parseChapterDraft(res.text);
    if (!draft) return reply.code(502).send({ error: 'bad_draft', message: 'Ответ не разобрался, попробуйте ещё раз' });
    return draft;
  });

  app.post<{ Params: { id: string } }>('/api/gm/chronicle/:id/quiz-draft', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const r = getChapter(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    if (!draftsAvailable(roomId)) return reply.code(403).send({ error: 'off', message: 'Черновики Claude выключены (нет ключа ANTHROPIC_API_KEY)' });
    const res = await generateText(quizPrompt(r.title, r.text), true);
    if (!res.ok) {
      request.log.warn({ reason: res.reason }, 'claude: викторина не получилась');
      return reply.code(502).send({ error: 'claude_unavailable', message: FAILURE_TEXT[res.reason] });
    }
    request.log.info({ model: res.model, in: res.inputTokens, out: res.outputTokens }, 'claude: викторина готова');
    const quiz = parseQuizDraft(res.text);
    if (!quiz) return reply.code(502).send({ error: 'bad_draft', message: 'Ответ не разобрался, попробуйте ещё раз' });
    return { quiz };
  });
}
