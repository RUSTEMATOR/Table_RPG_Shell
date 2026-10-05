import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ItemWriteSchema, PlayerCharacterResponseSchema, SheetWriteSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { loadCharacter, loadOwnedCharacter } from '../domain/repo.ts';
import { createSheetEntry, deleteSheetEntry, getSheetEntry, SHEET_MAX, sheetCount, updateSheetEntry } from '../domain/sheet.ts';
import { characterView } from '../domain/views.ts';
import { notifyCharacterChanged } from '../realtime/notify.ts';
import { projectForPlayer } from '../visibility/character.ts';
import { findGmLeak } from '../visibility/guard.ts';

// Лист персонажа. Мастер — всё. Игрок — только видимое снаряжение своего персонажа.

export async function gmSheetRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  app.post<{ Params: { id: string } }>('/api/gm/characters/:id/sheet', async (request, reply) => {
    const b = SheetWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, request.params.id);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    if (sheetCount(lc.row.id) >= SHEET_MAX) return reply.code(400).send({ error: 'too_many' });
    createSheetEntry(lc.row.id, b.data, 'gm');
    notifyCharacterChanged(roomId, lc);
    return characterView(lc);
  });

  app.post<{ Params: { id: string; entry: string } }>('/api/gm/characters/:id/sheet/:entry', async (request, reply) => {
    const b = SheetWriteSchema.partial().safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, request.params.id);
    const e = lc && getSheetEntry(lc.row.id, request.params.entry);
    if (!lc || !e) return reply.code(404).send({ error: 'not_found' });
    const patch: Parameters<typeof updateSheetEntry>[1] = {};
    if (b.data.kind !== undefined) patch.kind = b.data.kind;
    if (b.data.title !== undefined) patch.title = b.data.title;
    if (b.data.text !== undefined) patch.text = b.data.text;
    if (b.data.textGm !== undefined) patch.textGm = b.data.textGm;
    if (b.data.visible !== undefined) patch.visible = b.data.visible;
    updateSheetEntry(e, patch, 'gm');
    notifyCharacterChanged(roomId, lc);
    return characterView(lc);
  });

  app.post<{ Params: { id: string; entry: string } }>('/api/gm/characters/:id/sheet/:entry/delete', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, request.params.id);
    const e = lc && getSheetEntry(lc.row.id, request.params.entry);
    if (!lc || !e) return reply.code(404).send({ error: 'not_found' });
    deleteSheetEntry(e);
    notifyCharacterChanged(roomId, lc);
    return characterView(lc);
  });
}

async function requirePlayer(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) return reply.code(401).send({ error: 'unauthorized' });
  if (request.auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
}

export async function playerSheetRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requirePlayer);

  // Маркер в своём тексте заблокировал бы карточку игрока предохранителем — отклоняем на входе, как в дневнике.
  const parse = (body: unknown) => {
    const b = ItemWriteSchema.safeParse(body);
    return b.success && !findGmLeak(JSON.stringify([b.data.title, b.data.text])) ? b.data : null;
  };
  const answer = (roomId: string, memberId: string) => {
    const lc = loadOwnedCharacter(roomId, memberId);
    return PlayerCharacterResponseSchema.parse({ character: lc ? projectForPlayer(lc) : null });
  };

  app.post('/api/player/sheet/items', async (request, reply) => {
    const w = parse(request.body);
    if (!w) return reply.code(400).send({ error: 'bad_request' });
    const { room, member } = request.auth!;
    const lc = loadOwnedCharacter(room.id, member.id);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    if (sheetCount(lc.row.id) >= SHEET_MAX) return reply.code(400).send({ error: 'too_many' });
    createSheetEntry(lc.row.id, { kind: 'item', title: w.title, text: w.text, textGm: '', visible: true }, 'player');
    notifyCharacterChanged(room.id, lc);
    return answer(room.id, member.id);
  });

  // Скрытую запись и не-снаряжение игрок не может ни менять, ни удалять: ответ тот же, что для несуществующей.
  const ownItem = (roomId: string, memberId: string, id: string) => {
    const lc = loadOwnedCharacter(roomId, memberId);
    const e = lc && getSheetEntry(lc.row.id, id);
    return lc && e && e.kind === 'item' && e.visible ? { lc, e } : null;
  };

  app.post<{ Params: { id: string } }>('/api/player/sheet/items/:id', async (request, reply) => {
    const w = parse(request.body);
    if (!w) return reply.code(400).send({ error: 'bad_request' });
    const { room, member } = request.auth!;
    const found = ownItem(room.id, member.id, request.params.id);
    if (!found) return reply.code(404).send({ error: 'not_found' });
    updateSheetEntry(found.e, { title: w.title, text: w.text }, 'player');
    notifyCharacterChanged(room.id, found.lc);
    return answer(room.id, member.id);
  });

  app.post<{ Params: { id: string } }>('/api/player/sheet/items/:id/delete', async (request, reply) => {
    const { room, member } = request.auth!;
    const found = ownItem(room.id, member.id, request.params.id);
    if (!found) return reply.code(404).send({ error: 'not_found' });
    deleteSheetEntry(found.e);
    notifyCharacterChanged(room.id, found.lc);
    return answer(room.id, member.id);
  });
}
