import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import {
  MapIdSchema,
  NoteWriteSchema,
  PartyWriteSchema,
  PlaceWriteSchema,
  ProposalDecideSchema,
  ProposeSchema,
  RegionWriteSchema,
  TableMapWriteSchema,
  TokenAddSchema,
  TokenWriteSchema,
  TravelSchema,
  type MapId,
} from '@zg/shared';
import { cancelProposal, decideProposal, getProposal, gmProposals, ownProposal, propose, publicRoute, travelTo } from '../domain/travel.ts';
import { requireGm } from '../auth/requireGm.ts';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import {
  addToken,
  createPlace,
  deletePlace,
  deleteToken,
  getPlace,
  getRegion,
  getToken,
  gmMapView,
  pieceKey,
  pieces,
  setParty,
  setTableMap,
  updatePlace,
  updateRegion,
  updateToken,
} from '../domain/maps.ts';
import { notifyMapChanged, notifyPlaceChanged } from '../realtime/maps.ts';
import { publish } from '../realtime/publish.ts';
import { projectMapForPlayer, projectMapForTable } from '../visibility/map.ts';
import { pushTable } from './scenes.ts';

// Карты: мастеру — всё и правка; игроку — открытое и свои заметки; столу — открытое.

function mapParam(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): MapId | null {
  const id = MapIdSchema.safeParse(request.params.id);
  if (!id.success) {
    void reply.code(404).send({ error: 'not_found' });
    return null;
  }
  return id.data;
}

export async function gmMapRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  app.get<{ Params: { id: string } }>('/api/gm/maps/:id', async (request, reply) => {
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    return gmMapView(request.auth!.room.id, mapId);
  });

  app.post<{ Params: { id: string } }>('/api/gm/maps/regions/:id', async (request, reply) => {
    const b = RegionWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const r = getRegion(roomId, request.params.id);
    if (!r) return reply.code(404).send({ error: 'not_found' });
    const patch: { visible?: boolean; noteGm?: string } = {};
    if (b.data.visible !== undefined) patch.visible = b.data.visible;
    if (b.data.noteGm !== undefined) patch.noteGm = b.data.noteGm;
    updateRegion(r, patch);
    const mapId = MapIdSchema.parse(r.mapId);
    notifyMapChanged(roomId, mapId);
    return gmMapView(roomId, mapId);
  });

  app.post<{ Params: { id: string } }>('/api/gm/maps/:id/places', async (request, reply) => {
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    const b = PlaceWriteSchema.safeParse(request.body);
    if (!b.success || b.data.x === undefined || b.data.y === undefined) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const p = createPlace(roomId, mapId, {
      name: b.data.name ?? '',
      kind: b.data.kind ?? 'mark',
      x: b.data.x,
      y: b.data.y,
      side: b.data.side ?? 'r',
      subtitle: b.data.subtitle ?? '',
      visible: b.data.visible ?? false,
      noteGm: b.data.noteGm ?? '',
    });
    notifyMapChanged(roomId, mapId);
    return { id: p.id, map: gmMapView(roomId, mapId) };
  });

  app.post<{ Params: { id: string } }>('/api/gm/maps/places/:id', async (request, reply) => {
    const b = PlaceWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const p = getPlace(roomId, request.params.id);
    if (!p || p.kind === 'deleted') return reply.code(404).send({ error: 'not_found' });
    const patch: Parameters<typeof updatePlace>[1] = {};
    for (const k of ['name', 'kind', 'x', 'y', 'side', 'subtitle', 'visible', 'noteGm', 'description', 'ruler', 'faction', 'population'] as const) {
      if (b.data[k] !== undefined) Object.assign(patch, { [k]: b.data[k] });
    }
    updatePlace(p, patch);
    const mapId = MapIdSchema.parse(p.mapId);
    notifyMapChanged(roomId, mapId);
    notifyPlaceChanged(roomId, p.id);
    return gmMapView(roomId, mapId);
  });

  app.post<{ Params: { id: string } }>('/api/gm/maps/places/:id/delete', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const p = getPlace(roomId, request.params.id);
    if (!p || p.kind === 'deleted') return reply.code(404).send({ error: 'not_found' });
    deletePlace(p);
    const mapId = MapIdSchema.parse(p.mapId);
    notifyMapChanged(roomId, mapId);
    notifyPlaceChanged(roomId, p.id);
    return gmMapView(roomId, mapId);
  });

  app.post('/api/gm/maps/party', async (request, reply) => {
    const b = PartyWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const before = db.select({ mapId: schema.mapParty.mapId }).from(schema.mapParty).where(eq(schema.mapParty.roomId, roomId)).get();
    setParty(roomId, b.data);
    // Маркер мог уйти с одной карты на другую: сообщаем обеим.
    const touched = new Set([before?.mapId, b.data?.mapId].filter((m): m is MapId => MapIdSchema.safeParse(m).success));
    touched.forEach((m) => notifyMapChanged(roomId, m));
    return { ok: true };
  });

  // Поход отряда (этап 28): отряд сразу в месте, путь по открытым дорогам — анимация у всех.
  app.post('/api/gm/maps/party/travel', async (request, reply) => {
    const b = TravelSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const place = getPlace(roomId, b.data.placeId);
    if (!place || place.kind === 'deleted' || place.mapId !== b.data.mapId) return reply.code(404).send({ error: 'not_found' });
    const before = db.select({ mapId: schema.mapParty.mapId }).from(schema.mapParty).where(eq(schema.mapParty.roomId, roomId)).get();
    travelTo(roomId, b.data.mapId, place);
    const touched = new Set([before?.mapId, b.data.mapId].filter((m): m is MapId => MapIdSchema.safeParse(m).success));
    touched.forEach((m) => notifyMapChanged(roomId, m));
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/api/gm/maps/:id/proposals', async (request, reply) => {
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    return gmProposals(request.auth!.room.id, mapId);
  });

  app.post<{ Params: { id: string } }>('/api/gm/maps/proposals/:id', async (request, reply) => {
    const b = ProposalDecideSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const p = getProposal(roomId, request.params.id);
    if (!p || p.status !== 'pending') return reply.code(404).send({ error: 'not_found' });
    const mapId = MapIdSchema.parse(p.mapId);
    // принятое закрывает и остальные ожидающие — их авторы тоже узнают
    const affected = db
      .select({ m: schema.mapProposal.memberId })
      .from(schema.mapProposal)
      .where(and(eq(schema.mapProposal.roomId, roomId), eq(schema.mapProposal.mapId, mapId), eq(schema.mapProposal.status, 'pending')))
      .all()
      .map((r) => r.m);
    decideProposal(p, b.data.status);
    if (b.data.status === 'accepted') {
      const place = getPlace(roomId, p.placeId);
      if (place && place.kind !== 'deleted') {
        travelTo(roomId, mapId, place);
        notifyMapChanged(roomId, mapId);
      }
    }
    new Set(affected).forEach((memberId) => publish(roomId, { kind: 'member', memberId }, 'map:proposal.changed', { mapId }));
    publish(roomId, { kind: 'gm' }, 'gm:map.proposal', { mapId });
    return gmProposals(roomId, mapId);
  });

  // Фигурки (этап 24). Персонаж на карте один: повторная постановка переносит его фигурку.
  app.post<{ Params: { id: string } }>('/api/gm/maps/:id/tokens', async (request, reply) => {
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    const b = TokenAddSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const piece = pieces(roomId).find((p) => pieceKey(p) === pieceKey(b.data));
    if (!piece) return reply.code(404).send({ error: 'not_found' });
    const t = addToken(roomId, mapId, piece, b.data.x, b.data.y, b.data.visible ?? true);
    notifyMapChanged(roomId, mapId);
    return { id: t.id, map: gmMapView(roomId, mapId) };
  });

  app.post<{ Params: { id: string } }>('/api/gm/maps/tokens/:id', async (request, reply) => {
    const b = TokenWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const t = getToken(roomId, request.params.id);
    if (!t) return reply.code(404).send({ error: 'not_found' });
    const patch: { x?: number; y?: number; visible?: boolean } = {};
    if (b.data.x !== undefined) patch.x = b.data.x;
    if (b.data.y !== undefined) patch.y = b.data.y;
    if (b.data.visible !== undefined) patch.visible = b.data.visible;
    updateToken(t, patch);
    const mapId = MapIdSchema.parse(t.mapId);
    notifyMapChanged(roomId, mapId);
    return gmMapView(roomId, mapId);
  });

  app.post<{ Params: { id: string } }>('/api/gm/maps/tokens/:id/delete', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const t = getToken(roomId, request.params.id);
    if (!t) return reply.code(404).send({ error: 'not_found' });
    deleteToken(t);
    const mapId = MapIdSchema.parse(t.mapId);
    notifyMapChanged(roomId, mapId);
    return gmMapView(roomId, mapId);
  });

  // Карта на столе (вместо сцены) и наезд камеры. mapId null — убрать карту со стола.
  app.post('/api/gm/table/map', async (request, reply) => {
    const b = TableMapWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    setTableMap(roomId, b.data.mapId, b.data.focus);
    pushTable(roomId);
    if (b.data.mapId) publish(roomId, { kind: 'gm' }, 'gm:map.changed', { mapId: b.data.mapId });
    return { ok: true };
  });
}

export async function playerMapRoutes(app: FastifyInstance) {
  const player = (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth) {
      void reply.code(401).send({ error: 'unauthorized' });
      return null;
    }
    if (auth.member.role !== 'player') {
      void reply.code(403).send({ error: 'forbidden' });
      return null;
    }
    return auth;
  };

  app.get<{ Params: { id: string } }>('/api/player/maps/:id', async (request, reply) => {
    const auth = player(request, reply);
    if (!auth) return;
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    return projectMapForPlayer(auth.room.id, auth.member.id, mapId);
  });

  // Предложение «идём туда» (этап 28): только открытое место; дни — по пути от отряда по открытым дорогам.
  app.get<{ Params: { id: string } }>('/api/player/maps/:id/proposal', async (request, reply) => {
    const auth = player(request, reply);
    if (!auth) return;
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    return { proposal: ownProposal(auth.room.id, auth.member.id, mapId) };
  });

  app.post<{ Params: { id: string } }>('/api/player/maps/:id/propose', async (request, reply) => {
    const auth = player(request, reply);
    if (!auth) return;
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    const b = ProposeSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const place = getPlace(auth.room.id, b.data.placeId);
    if (!place || !place.visible || place.kind === 'deleted' || place.mapId !== mapId) return reply.code(404).send({ error: 'not_found' });
    const route = publicRoute(auth.room.id, mapId, place.id);
    propose(auth.room.id, auth.member.id, mapId, place, Math.round((route?.days.foot ?? 0) * 10) / 10);
    publish(auth.room.id, { kind: 'gm' }, 'gm:map.proposal', { mapId, who: auth.member.name, placeName: place.name });
    publish(auth.room.id, { kind: 'member', memberId: auth.member.id }, 'map:proposal.changed', { mapId });
    return { proposal: ownProposal(auth.room.id, auth.member.id, mapId) };
  });

  app.post<{ Params: { id: string } }>('/api/player/maps/:id/propose/cancel', async (request, reply) => {
    const auth = player(request, reply);
    if (!auth) return;
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    cancelProposal(auth.room.id, auth.member.id, mapId);
    publish(auth.room.id, { kind: 'gm' }, 'gm:map.proposal', { mapId });
    publish(auth.room.id, { kind: 'member', memberId: auth.member.id }, 'map:proposal.changed', { mapId });
    return { proposal: ownProposal(auth.room.id, auth.member.id, mapId) };
  });

  const ownNote = (roomId: string, memberId: string, id: string) =>
    db
      .select()
      .from(schema.mapPlayerNote)
      .where(and(eq(schema.mapPlayerNote.roomId, roomId), eq(schema.mapPlayerNote.memberId, memberId), eq(schema.mapPlayerNote.id, id)))
      .get();
  const done = (roomId: string, memberId: string, mapId: MapId) => {
    publish(roomId, { kind: 'member', memberId }, 'map:notes.changed', { mapId });
    return projectMapForPlayer(roomId, memberId, mapId);
  };

  app.post<{ Params: { id: string } }>('/api/player/maps/:id/notes', async (request, reply) => {
    const auth = player(request, reply);
    if (!auth) return;
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    const b = NoteWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const count = db
      .select({ id: schema.mapPlayerNote.id })
      .from(schema.mapPlayerNote)
      .where(and(eq(schema.mapPlayerNote.memberId, auth.member.id), eq(schema.mapPlayerNote.mapId, mapId)))
      .all().length;
    if (count >= 200) return reply.code(400).send({ error: 'too_many' });
    const now = Date.now();
    db.insert(schema.mapPlayerNote)
      .values({ id: newId(), roomId: auth.room.id, memberId: auth.member.id, mapId, ...b.data, createdAt: now, updatedAt: now })
      .run();
    return done(auth.room.id, auth.member.id, mapId);
  });

  app.post<{ Params: { id: string } }>('/api/player/maps/notes/:id', async (request, reply) => {
    const auth = player(request, reply);
    if (!auth) return;
    const b = NoteWriteSchema.partial().safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const n = ownNote(auth.room.id, auth.member.id, request.params.id);
    if (!n) return reply.code(404).send({ error: 'not_found' });
    const patch: { x?: number; y?: number; text?: string } = {};
    if (b.data.x !== undefined) patch.x = b.data.x;
    if (b.data.y !== undefined) patch.y = b.data.y;
    if (b.data.text !== undefined) patch.text = b.data.text;
    db.update(schema.mapPlayerNote)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(schema.mapPlayerNote.id, n.id))
      .run();
    return done(auth.room.id, auth.member.id, MapIdSchema.parse(n.mapId));
  });

  app.post<{ Params: { id: string } }>('/api/player/maps/notes/:id/delete', async (request, reply) => {
    const auth = player(request, reply);
    if (!auth) return;
    const n = ownNote(auth.room.id, auth.member.id, request.params.id);
    if (!n) return reply.code(404).send({ error: 'not_found' });
    db.delete(schema.mapPlayerNote).where(eq(schema.mapPlayerNote.id, n.id)).run();
    return done(auth.room.id, auth.member.id, MapIdSchema.parse(n.mapId));
  });
}

export async function tableMapRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/table/maps/:id', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'table' && auth.member.role !== 'gm') return reply.code(403).send({ error: 'forbidden' });
    const mapId = mapParam(request, reply);
    if (!mapId) return;
    return projectMapForTable(auth.room.id, mapId);
  });
}
