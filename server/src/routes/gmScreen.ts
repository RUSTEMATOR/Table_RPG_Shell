import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DiaryReplySchema, NoteSaveSchema, OverloadChangeSchema } from '@zg/shared';
import { checkHint } from '../ai/jev/integrations.ts';
import { requireGm } from '../auth/requireGm.ts';
import { db, schema } from '../db/client.ts';
import { diaryForGm, diaryForPlayer, getDiary, listDiaryForGm } from '../domain/diary.ts';
import { getNote, saveNote } from '../domain/notes.ts';
import { changeOverload, overloadView } from '../domain/overload.ts';
import { listCharacters } from '../domain/repo.ts';
import { activeSession } from '../domain/session.ts';
import { publish } from '../realtime/publish.ts';

export async function gmScreenRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);

  // ---- Перегрузка ----

  app.get('/api/gm/overload', async (request) =>
    listCharacters(request.auth!.room.id).map(({ row }) => overloadView(row)),
  );

  app.post<{ Params: { id: string } }>('/api/gm/overload/:id', async (request, reply) => {
    const b = OverloadChangeSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const c = db.select().from(schema.character).where(eq(schema.character.id, request.params.id)).get();
    if (!c || c.roomId !== roomId) return reply.code(404).send({ error: 'not_found' });
    const ov = changeOverload(c, b.data);
    publish(roomId, { kind: 'gm' }, 'gm:overload.changed', { overload: ov });
    return ov;
  });

  // Столу уходит только видимый признак, без числа и порогов.
  app.post<{ Params: { id: string } }>('/api/gm/overload/:id/show', async (request, reply) => {
    const roomId = request.auth!.room.id;
    const c = db.select().from(schema.character).where(eq(schema.character.id, request.params.id)).get();
    if (!c || c.roomId !== roomId) return reply.code(404).send({ error: 'not_found' });
    const ov = overloadView(c);
    publish(roomId, { kind: 'table' }, 'table:sign', { character: c.name, sign: ov.sign, at: Date.now() });
    return { ok: true };
  });

  // ---- Дневники и запросы (только не личные записи) ----

  app.get('/api/gm/diary', async (request) => listDiaryForGm(request.auth!.room.id).map(diaryForGm));

  app.post<{ Params: { id: string } }>('/api/gm/diary/:id/reply', async (request, reply) => {
    const b = DiaryReplySchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const e = getDiary(roomId, request.params.id);
    if (!e || e.private) return reply.code(404).send({ error: 'not_found' });
    const next = {
      ...e,
      reply: b.data.reply,
      requestState: e.request ? (b.data.close ? ('answered' as const) : ('open' as const)) : e.requestState,
      updatedAt: Date.now(),
    };
    db.update(schema.diaryEntry)
      .set({ reply: next.reply, requestState: next.requestState, updatedAt: next.updatedAt })
      .where(eq(schema.diaryEntry.id, e.id))
      .run();
    publish(roomId, { kind: 'member', memberId: e.memberId }, 'diary:changed', { entry: diaryForPlayer(next) });
    const gm = diaryForGm(next);
    publish(roomId, { kind: 'gm' }, 'gm:diary.changed', { entry: gm });
    return gm;
  });

  // ---- Заметки сессии ----

  app.get('/api/gm/notes', async (request) => getNote(activeSession(request.auth!.room.id).id));

  app.post('/api/gm/notes', async (request, reply) => {
    const b = NoteSaveSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const s = activeSession(roomId);
    const res = saveNote(s.id, b.data.text, b.data.baseUpdatedAt);
    if (!res.ok) return reply.code(409).send({ error: 'conflict', note: res.note });
    publish(roomId, { kind: 'gm' }, 'gm:notes.changed', { sessionId: s.id, updatedAt: res.note.updatedAt });
    return res.note;
  });

  // ---- Jev: проверка подсказки до сохранения ----

  const HintSchema = z.strictObject({ slot: z.number().int().min(0).max(9), hint: z.string().max(300) });
  app.post<{ Params: { id: string } }>('/api/gm/characters/:id/hint-check', async (request, reply) => {
    const b = HintSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    return checkHint(request.auth!.room.id, request.params.id, b.data.slot, b.data.hint);
  });
}
