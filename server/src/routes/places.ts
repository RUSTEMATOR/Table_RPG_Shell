import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { PlaceDraftSchema, PresenceAddSchema, PresenceWriteSchema, RumorWriteSchema, SpotWriteSchema } from '@zg/shared';
import { generateText, type ClaudeFailure } from '../ai/claude/client.ts';
import { requireGm } from '../auth/requireGm.ts';
import { getPlace, type PlaceRow } from '../domain/maps.ts';
import { IMAGE_BODY_LIMIT, IMAGE_TYPES } from '../domain/media.ts';
import { getNpc } from '../domain/npc.ts';
import {
  addPresence,
  clearPlaceImage,
  createRumor,
  createSpot,
  deletePresence,
  deleteRumor,
  deleteSpot,
  draftPrompt,
  draftsAvailable,
  getPresence,
  getRumor,
  getSpot,
  gmPlaceDetail,
  parseDraft,
  setPlaceImage,
  updatePresence,
  updateRumor,
  updateSpot,
} from '../domain/places.ts';
import { notifyPlaceChanged } from '../realtime/maps.ts';
import { projectPlaceDetail } from '../visibility/map.ts';

// Города (этап 27): мастеру — карточка места целиком и правка (места в городе, слухи и задания, «кто здесь», картинка,
// черновики Claude); игроку и столу — только открытое (visibility/map.ts). Каждая правка — сигнал карточке места.

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

export async function gmPlaceRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.addContentTypeParser(IMAGE_TYPES, { parseAs: 'buffer', bodyLimit: IMAGE_BODY_LIMIT }, (_req, body, done) => done(null, body));

  const placeOf = (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): PlaceRow | null => {
    const p = getPlace(request.auth!.room.id, request.params.id);
    if (!p || p.kind === 'deleted') {
      void reply.code(404).send({ error: 'not_found' });
      return null;
    }
    return p;
  };
  /** После правки: сигнал карточке места и свежая карточка мастеру. */
  const done = (roomId: string, placeId: string) => {
    notifyPlaceChanged(roomId, placeId);
    const p = getPlace(roomId, placeId)!;
    return gmPlaceDetail(roomId, p);
  };

  app.get<{ Params: { id: string } }>('/api/gm/maps/places/:id/detail', async (request, reply) => {
    const p = placeOf(request, reply);
    if (!p) return;
    return gmPlaceDetail(request.auth!.room.id, p);
  });

  // ---- места в городе ----
  app.post<{ Params: { id: string } }>('/api/gm/maps/places/:id/spots', async (request, reply) => {
    const p = placeOf(request, reply);
    if (!p) return;
    const b = SpotWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    createSpot(p, {
      kind: b.data.kind ?? 'other',
      name: b.data.name ?? '',
      description: b.data.description ?? '',
      visible: b.data.visible ?? true,
      noteGm: b.data.noteGm ?? '',
      ...(b.data.sort !== undefined ? { sort: b.data.sort } : {}),
    });
    return done(p.roomId, p.id);
  });
  app.post<{ Params: { id: string } }>('/api/gm/maps/spots/:id', async (request, reply) => {
    const b = SpotWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const s = getSpot(request.auth!.room.id, request.params.id);
    if (!s) return reply.code(404).send({ error: 'not_found' });
    const patch: Parameters<typeof updateSpot>[1] = {};
    for (const k of ['kind', 'name', 'description', 'visible', 'noteGm', 'sort'] as const) if (b.data[k] !== undefined) Object.assign(patch, { [k]: b.data[k] });
    updateSpot(s, patch);
    return done(s.roomId, s.placeId);
  });
  app.post<{ Params: { id: string } }>('/api/gm/maps/spots/:id/delete', async (request, reply) => {
    const s = getSpot(request.auth!.room.id, request.params.id);
    if (!s) return reply.code(404).send({ error: 'not_found' });
    deleteSpot(s);
    return done(s.roomId, s.placeId);
  });

  // ---- слухи и задания ----
  app.post<{ Params: { id: string } }>('/api/gm/maps/places/:id/rumors', async (request, reply) => {
    const p = placeOf(request, reply);
    if (!p) return;
    const b = RumorWriteSchema.safeParse(request.body);
    if (!b.success || !b.data.text) return reply.code(400).send({ error: 'bad_request' });
    createRumor(p, { kind: b.data.kind ?? 'rumor', text: b.data.text, visible: b.data.visible ?? false, noteGm: b.data.noteGm ?? '' });
    return done(p.roomId, p.id);
  });
  app.post<{ Params: { id: string } }>('/api/gm/maps/rumors/:id', async (request, reply) => {
    const b = RumorWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const r = getRumor(request.auth!.room.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    const patch: Parameters<typeof updateRumor>[1] = {};
    for (const k of ['kind', 'text', 'visible', 'noteGm'] as const) if (b.data[k] !== undefined) Object.assign(patch, { [k]: b.data[k] });
    updateRumor(r, patch);
    return done(r.roomId, r.placeId);
  });
  app.post<{ Params: { id: string } }>('/api/gm/maps/rumors/:id/delete', async (request, reply) => {
    const r = getRumor(request.auth!.room.id, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    deleteRumor(r);
    return done(r.roomId, r.placeId);
  });

  // ---- кто здесь ----
  app.post<{ Params: { id: string } }>('/api/gm/maps/places/:id/presence', async (request, reply) => {
    const p = placeOf(request, reply);
    if (!p) return;
    const b = PresenceAddSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    if (!getNpc(p.roomId, b.data.npcId)) return reply.code(404).send({ error: 'not_found' });
    const spot = b.data.spotId ? getSpot(p.roomId, b.data.spotId) : null;
    if (b.data.spotId && spot?.placeId !== p.id) return reply.code(404).send({ error: 'not_found' });
    addPresence(p, b.data.npcId, spot?.id ?? null, b.data.label);
    return done(p.roomId, p.id);
  });
  app.post<{ Params: { id: string } }>('/api/gm/maps/presence/:id', async (request, reply) => {
    const b = PresenceWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const x = getPresence(request.auth!.room.id, request.params.id);
    if (!x) return reply.code(404).send({ error: 'not_found' });
    if (b.data.spotId && getSpot(x.roomId, b.data.spotId)?.placeId !== x.placeId) return reply.code(404).send({ error: 'not_found' });
    const patch: Parameters<typeof updatePresence>[1] = {};
    if (b.data.spotId !== undefined) patch.spotId = b.data.spotId;
    if (b.data.label !== undefined) patch.label = b.data.label;
    if (b.data.visible !== undefined) patch.visible = b.data.visible;
    updatePresence(x, patch);
    return done(x.roomId, x.placeId);
  });
  app.post<{ Params: { id: string } }>('/api/gm/maps/presence/:id/delete', async (request, reply) => {
    const x = getPresence(request.auth!.room.id, request.params.id);
    if (!x) return reply.code(404).send({ error: 'not_found' });
    deletePresence(x);
    return done(x.roomId, x.placeId);
  });

  // ---- картинка ----
  app.post<{ Params: { id: string } }>('/api/gm/maps/places/:id/image', async (request, reply) => {
    const p = placeOf(request, reply);
    if (!p) return;
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) return reply.code(400).send({ error: 'no_image' });
    try {
      await setPlaceImage(p, request.body);
    } catch (err) {
      request.log.warn({ err }, 'place: картинка не обработалась');
      return reply.code(400).send({ error: 'bad_image', message: 'Не получилось прочитать картинку' });
    }
    return done(p.roomId, p.id);
  });
  app.post<{ Params: { id: string } }>('/api/gm/maps/places/:id/image/delete', async (request, reply) => {
    const p = placeOf(request, reply);
    if (!p) return;
    clearPlaceImage(p);
    return done(p.roomId, p.id);
  });

  // ---- черновик Claude: в поле, не сохраняется — правит и сохраняет человек ----
  app.post<{ Params: { id: string } }>('/api/gm/maps/places/:id/draft', async (request, reply) => {
    const p = placeOf(request, reply);
    if (!p) return;
    const b = PlaceDraftSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    if (!draftsAvailable(p.roomId)) return reply.code(403).send({ error: 'off', message: 'Черновики Claude выключены (нет ключа или демо-комната)' });
    const res = await generateText(draftPrompt(b.data.part, p), true);
    if (!res.ok) {
      request.log.warn({ reason: res.reason, part: b.data.part }, 'claude: черновик места не получился');
      return reply.code(502).send({ error: 'claude_unavailable', message: FAILURE_TEXT[res.reason] });
    }
    request.log.info({ part: b.data.part, model: res.model, in: res.inputTokens, out: res.outputTokens }, 'claude: черновик места готов');
    const draft = parseDraft(b.data.part, res.text);
    if (!draft) return reply.code(502).send({ error: 'bad_draft', message: 'Ответ не разобрался, попробуйте ещё раз' });
    return draft;
  });
}

/** Игроку и столу — открытая карточка места; скрытое — 404, как несуществующее. */
export async function publicPlaceRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/player/maps/places/:id', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    const d = projectPlaceDetail(auth.room.id, request.params.id);
    return d ?? reply.code(404).send({ error: 'not_found' });
  });
  app.get<{ Params: { id: string } }>('/api/table/maps/places/:id', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'table' && auth.member.role !== 'gm') return reply.code(403).send({ error: 'forbidden' });
    const d = projectPlaceDetail(auth.room.id, request.params.id);
    return d ?? reply.code(404).send({ error: 'not_found' });
  });
}
