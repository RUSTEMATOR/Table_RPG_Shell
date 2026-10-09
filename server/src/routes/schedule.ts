import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SlotWriteSchema, VoteWriteSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { addOption, deleteSlot, getSlot, icsFor, planSlot, remindNow, scheduleForGm, scheduleForPlayer, vote } from '../domain/schedule.ts';

// Расписание и явка (этап 46). Игроку — проекция с именами персонажей; мастеру — всё; стол — ничего.

async function requirePlayer(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) return reply.code(401).send({ error: 'unauthorized' });
  if (request.auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
}

export async function playerScheduleRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requirePlayer);
  app.get('/api/player/schedule', async (request) => scheduleForPlayer(request.auth!.room.id, request.auth!.member.id));
  app.post<{ Params: { id: string } }>('/api/player/schedule/:id/vote', async (request, reply) => {
    const b = VoteWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const { room, member } = request.auth!;
    const s = getSlot(room.id, request.params.id);
    if (!s) return reply.code(404).send({ error: 'not_found' });
    vote(s, member.id, b.data.answer);
    return scheduleForPlayer(room.id, member.id);
  });
}

export async function gmScheduleRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.get('/api/gm/schedule', async (request) => scheduleForGm(request.auth!.room.id));
  app.post('/api/gm/schedule/options', async (request, reply) => {
    const b = SlotWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    addOption(request.auth!.room.id, b.data);
    return scheduleForGm(request.auth!.room.id);
  });
  app.post<{ Params: { id: string } }>('/api/gm/schedule/:id/plan', async (request, reply) => {
    const s = getSlot(request.auth!.room.id, request.params.id);
    if (!s) return reply.code(404).send({ error: 'not_found' });
    planSlot(s);
    return scheduleForGm(s.roomId);
  });
  app.post<{ Params: { id: string } }>('/api/gm/schedule/:id/delete', async (request, reply) => {
    const s = getSlot(request.auth!.room.id, request.params.id);
    if (!s) return reply.code(404).send({ error: 'not_found' });
    deleteSlot(s);
    return scheduleForGm(s.roomId);
  });
  app.post<{ Params: { id: string } }>('/api/gm/schedule/:id/remind', async (request, reply) => {
    const s = getSlot(request.auth!.room.id, request.params.id);
    if (!s || s.kind !== 'planned') return reply.code(404).send({ error: 'not_found' });
    remindNow(s);
    return { ok: true };
  });
}

/** Файл календаря — игроку и мастеру комнаты. */
export async function scheduleIcsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/schedule/:id/ics', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role === 'table') return reply.code(403).send({ error: 'forbidden' });
    const s = getSlot(auth.room.id, request.params.id);
    if (!s) return reply.code(404).send({ error: 'not_found' });
    reply.header('content-type', 'text/calendar; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="zelenogorye-${s.id}.ics"`);
    return icsFor(s, auth.room.name);
  });
}
