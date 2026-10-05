import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SceneWriteSchema } from '@zg/shared';
import { checkPublicText } from '../ai/jev/integrations.ts';
import { requireGm } from '../auth/requireGm.ts';
import { listCharacters } from '../domain/repo.ts';
import {
  createScene,
  deleteScene,
  getScene,
  gmScene,
  listScenes,
  projectForTable,
  setSceneImage,
  setShown,
  shownSceneId,
  updateScene,
} from '../domain/scenes.ts';
import { IMAGE_BODY_LIMIT, IMAGE_TYPES, mediaAllowed, mediaPath } from '../domain/media.ts';
import { publish } from '../realtime/publish.ts';
import { setTableMap } from '../domain/maps.ts';

export function pushTable(roomId: string) {
  publish(roomId, { kind: 'table' }, 'table:state', projectForTable(roomId));
  publish(roomId, { kind: 'gm' }, 'gm:scenes.changed');
  publish(roomId, { kind: 'gm' }, 'gm:npcs.changed');
}

export async function gmSceneRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  // Картинка приходит сырым телом запроса (Content-Type: image/*), до 15 МБ.
  app.addContentTypeParser(IMAGE_TYPES, { parseAs: 'buffer', bodyLimit: IMAGE_BODY_LIMIT }, (_req, body, done) => done(null, body));

  app.get('/api/gm/scenes', async (request) => {
    const roomId = request.auth!.room.id;
    const shown = shownSceneId(roomId);
    return listScenes(roomId).map((r) => gmScene(r, shown));
  });

  app.post('/api/gm/scenes', async (request, reply) => {
    const b = SceneWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const r = createScene(roomId, b.data);
    publish(roomId, { kind: 'gm' }, 'gm:scenes.changed');
    return gmScene(r, shownSceneId(roomId));
  });

  app.post<{ Params: { id: string } }>('/api/gm/scenes/:id', async (request, reply) => {
    const b = SceneWriteSchema.partial().safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const r = getScene(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    const patch: Parameters<typeof updateScene>[1] = {};
    if (b.data.title !== undefined) patch.title = b.data.title;
    if (b.data.textPublic !== undefined) patch.textPublic = b.data.textPublic;
    if (b.data.textGm !== undefined) patch.textGm = b.data.textGm;
    const next = updateScene(r, patch);
    if (shownSceneId(roomId) === r.id) pushTable(roomId);
    else publish(roomId, { kind: 'gm' }, 'gm:scenes.changed');
    return gmScene(next, shownSceneId(roomId));
  });

  app.post<{ Params: { id: string } }>('/api/gm/scenes/:id/image', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const r = getScene(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) return reply.code(400).send({ error: 'no_image' });
    let next;
    try {
      next = await setSceneImage(r, request.body);
    } catch (err) {
      request.log.warn({ err }, 'scene: картинка не обработалась');
      return reply.code(400).send({ error: 'bad_image', message: 'Не получилось прочитать картинку' });
    }
    if (shownSceneId(roomId) === r.id) pushTable(roomId);
    else publish(roomId, { kind: 'gm' }, 'gm:scenes.changed');
    return gmScene(next, shownSceneId(roomId));
  });

  app.post<{ Params: { id: string } }>('/api/gm/scenes/:id/delete', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const r = getScene(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    const wasShown = shownSceneId(roomId) === r.id;
    deleteScene(r);
    if (wasShown) pushTable(roomId);
    else publish(roomId, { kind: 'gm' }, 'gm:scenes.changed');
    return { ok: true };
  });

  const ShowSchema = z.strictObject({ sceneId: z.string().min(1).max(64).nullable() });
  app.post('/api/gm/table/show', async (request, reply) => {
    const b = ShowSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    if (b.data.sceneId && !getScene(roomId, b.data.sceneId)) return reply.code(404).send({ error: 'not_found' });
    setShown(roomId, b.data.sceneId);
    // Новая сцена на столе убирает карту: иначе мастер показал бы сцену, а стол продолжал бы показывать карту.
    if (b.data.sceneId) setTableMap(roomId, null, null);
    pushTable(roomId);
    return { ok: true };
  });

  // Страж Jev для текста сцены: по скрытым и намекнутым чертам всех персонажей комнаты.
  const CheckSchema = z.strictObject({ text: z.string().max(4000) });
  app.post('/api/gm/scenes/check', async (request, reply) => {
    const b = CheckSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    return checkPublicText(roomId, b.data.text, listCharacters(roomId).map((c) => c.doc));
  });
}

export async function tableRoutes(app: FastifyInstance) {
  app.get('/api/table/state', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'table' && auth.member.role !== 'gm') return reply.code(403).send({ error: 'forbidden' });
    return projectForTable(auth.room.id);
  });

  app.get<{ Params: { file: string } }>('/api/media/:file', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    const path = mediaPath(request.params.file);
    if (!path || !mediaAllowed(auth.room.id, auth.member.role, request.params.file)) return reply.code(404).send({ error: 'not_found' });
    // Имя файла уникально для каждой загрузки — можно кэшировать надолго, но только в браузере.
    reply.header('cache-control', 'private, max-age=31536000, immutable').type('image/webp');
    return reply.send(createReadStream(path));
  });
}
