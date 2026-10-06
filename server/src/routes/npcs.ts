import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FigureSchema, NpcWriteSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { IMAGE_BODY_LIMIT, IMAGE_TYPES } from '../domain/media.ts';
import { createNpc, deleteNpc, getNpc, gmNpc, listNpcs, setNpcFigure, setNpcImage, updateNpc, type NpcRow } from '../domain/npc.ts';
import { setShownNpc, shownNpcId } from '../domain/scenes.ts';
import { activeSession, setOpponent } from '../domain/session.ts';
import { mapsWithPiece } from '../domain/maps.ts';
import { notifyPieceMaps } from '../realtime/maps.ts';
import { placesWithNpc } from '../domain/places.ts';
import { publish } from '../realtime/publish.ts';
import { pushTable } from './scenes.ts';

// Библиотека противников. Только мастер; столу — портрет и имя через projectForTable.

export async function gmNpcRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.addContentTypeParser(IMAGE_TYPES, { parseAs: 'buffer', bodyLimit: IMAGE_BODY_LIMIT }, (_req, body, done) => done(null, body));

  const view = (roomId: string, r: NpcRow) => gmNpc(r, shownNpcId(roomId), activeSession(roomId).opponentNpcId);

  /** После правки: если это противник сессии — обновить копию в сессии; если он на столе — обновить стол. */
  const changed = (roomId: string, r: NpcRow) => {
    const s = activeSession(roomId);
    if (s.opponentNpcId === r.id) {
      setOpponent(roomId, r.name, r.power, r.id);
      publish(roomId, { kind: 'gm' }, 'gm:session.changed');
    }
    if (shownNpcId(roomId) === r.id) pushTable(roomId);
    else publish(roomId, { kind: 'gm' }, 'gm:npcs.changed');
    notifyPieceMaps(roomId, { npcId: r.id });
  };

  app.get('/api/gm/npcs', async (request) => {
    const roomId = request.auth!.room.id;
    const shown = shownNpcId(roomId);
    const opponent = activeSession(roomId).opponentNpcId;
    return listNpcs(roomId).map((r) => gmNpc(r, shown, opponent));
  });

  app.post('/api/gm/npcs', async (request, reply) => {
    const b = NpcWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const r = createNpc(roomId, b.data);
    publish(roomId, { kind: 'gm' }, 'gm:npcs.changed');
    return view(roomId, r);
  });

  app.post<{ Params: { id: string } }>('/api/gm/npcs/:id', async (request, reply) => {
    const b = NpcWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const r = getNpc(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    const next = updateNpc(r, b.data);
    changed(roomId, next);
    return view(roomId, next);
  });

  app.post<{ Params: { id: string } }>('/api/gm/npcs/:id/image', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const r = getNpc(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) return reply.code(400).send({ error: 'no_image' });
    let next;
    try {
      next = await setNpcImage(r, request.body);
    } catch (err) {
      request.log.warn({ err }, 'npc: картинка не обработалась');
      return reply.code(400).send({ error: 'bad_image', message: 'Не получилось прочитать картинку' });
    }
    changed(roomId, next);
    return view(roomId, next);
  });

  // Фигурка противника (этап 23); null — убрать.
  app.post<{ Params: { id: string } }>('/api/gm/npcs/:id/figure', async (request, reply) => {
    const b = FigureSchema.nullable().safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const r = getNpc(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    const next = setNpcFigure(r, b.data);
    changed(roomId, next);
    return view(roomId, next);
  });

  app.post<{ Params: { id: string } }>('/api/gm/npcs/:id/delete', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const r = getNpc(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    const wasShown = shownNpcId(roomId) === r.id;
    const wasOpponent = activeSession(roomId).opponentNpcId === r.id;
    // Имя и сила в сессии остаются (ручной противник), ссылка на библиотеку обнуляется внешним ключом.
    // Его фигурки с карт уходят вместе с ним (внешний ключ) — карты узнают об этом.
    const maps = mapsWithPiece(roomId, { npcId: r.id });
    const places = placesWithNpc(roomId, r.id);
    deleteNpc(r);
    notifyPieceMaps(roomId, { npcId: r.id }, maps, places);
    if (wasOpponent) publish(roomId, { kind: 'gm' }, 'gm:session.changed');
    if (wasShown) pushTable(roomId);
    else publish(roomId, { kind: 'gm' }, 'gm:npcs.changed');
    return { ok: true };
  });

  const ShowSchema = z.strictObject({ npcId: z.string().min(1).max(64).nullable() });
  app.post('/api/gm/table/npc', async (request, reply) => {
    const b = ShowSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    if (b.data.npcId && !getNpc(roomId, b.data.npcId)) return reply.code(404).send({ error: 'not_found' });
    setShownNpc(roomId, b.data.npcId);
    pushTable(roomId);
    return { ok: true };
  });
}
