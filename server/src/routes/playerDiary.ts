import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DiaryListPlayerSchema, DiaryWriteSchema } from '@zg/shared';
import { matchDiaryInBackground } from '../ai/jev/integrations.ts';
import { forgetJudgments } from '../ai/jev/judgments.ts';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { diaryForGm, diaryForPlayer, getDiary, listOwnDiary, type DiaryRow } from '../domain/diary.ts';
import { loadOwnedCharacter } from '../domain/repo.ts';
import { pushToGm } from '../push/send.ts';
import { publish } from '../realtime/publish.ts';
import { findGmLeak } from '../visibility/guard.ts';

async function requirePlayer(request: FastifyRequest, reply: FastifyReply) {
  if (!request.auth) return reply.code(401).send({ error: 'unauthorized' });
  if (request.auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
}

/** Разослать изменение: игроку (все его устройства), мастеру — только если запись не личная. */
function broadcast(roomId: string, e: DiaryRow, wasPublic: boolean) {
  publish(roomId, { kind: 'member', memberId: e.memberId }, 'diary:changed', { entry: diaryForPlayer(e) });
  if (!e.private) publish(roomId, { kind: 'gm' }, 'gm:diary.changed', { entry: diaryForGm(e) });
  else if (wasPublic) publish(roomId, { kind: 'gm' }, 'gm:diary.removed', { id: e.id });
}

export async function playerDiaryRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requirePlayer);

  app.get('/api/player/diary', async (request) => DiaryListPlayerSchema.parse({ entries: listOwnDiary(request.auth!.room.id, request.auth!.member.id).map(diaryForPlayer) }));

  app.post('/api/player/diary', async (request, reply) => {
    const b = DiaryWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    // Маркер в своём тексте заблокировал бы ленту игрока предохранителем.
    if (findGmLeak(JSON.stringify(b.data.text))) return reply.code(400).send({ error: 'bad_request' });
    const { room, member } = request.auth!;
    const isPrivate = b.data.private && !b.data.request;
    const now = Date.now();
    const row: DiaryRow = {
      id: newId(),
      roomId: room.id,
      memberId: member.id,
      characterId: loadOwnedCharacter(room.id, member.id)?.row.id ?? null,
      text: b.data.text,
      private: isPrivate,
      request: b.data.request,
      requestState: b.data.request ? 'open' : null,
      reply: '',
      createdAt: now,
      updatedAt: now,
    };
    db.insert(schema.diaryEntry).values(row).run();
    broadcast(room.id, row, false);
    if (row.request) pushToGm(room.id, { title: 'Вопрос мастеру', body: `Вопрос от ${member.name}`, url: '/gm/requests', tag: `request:${member.id}` });
    matchDiaryInBackground(room.id, row);
    return diaryForPlayer(row);
  });

  app.post<{ Params: { id: string } }>('/api/player/diary/:id', async (request, reply) => {
    const b = DiaryWriteSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    if (findGmLeak(JSON.stringify(b.data.text))) return reply.code(400).send({ error: 'bad_request' });
    const { room, member } = request.auth!;
    const e = getDiary(room.id, request.params.id);
    if (!e || e.memberId !== member.id) return reply.code(404).send({ error: 'not_found' });
    const isPrivate = b.data.private && !b.data.request;
    const next: DiaryRow = {
      ...e,
      text: b.data.text,
      private: isPrivate,
      request: b.data.request,
      requestState: b.data.request ? (e.requestState ?? 'open') : null,
      updatedAt: Date.now(),
    };
    db.update(schema.diaryEntry)
      .set({ text: next.text, private: next.private, request: next.request, requestState: next.requestState, updatedAt: next.updatedAt })
      .where(and(eq(schema.diaryEntry.id, e.id), eq(schema.diaryEntry.memberId, member.id)))
      .run();
    if (next.private && !e.private) forgetJudgments(room.id, e.id);
    broadcast(room.id, next, !e.private);
    // новый вопрос (запись стала вопросом или открытый вопрос переписан) — мастеру
    if (next.request && (!e.request || (next.text !== e.text && next.requestState === 'open')))
      pushToGm(room.id, { title: 'Вопрос мастеру', body: `Вопрос от ${member.name}`, url: '/gm/requests', tag: `request:${member.id}` });
    if (next.text !== e.text || (e.private && !next.private)) matchDiaryInBackground(room.id, next);
    return diaryForPlayer(next);
  });

  app.post<{ Params: { id: string } }>('/api/player/diary/:id/delete', async (request, reply) => {
    const { room, member } = request.auth!;
    const e = getDiary(room.id, request.params.id);
    if (!e || e.memberId !== member.id) return reply.code(404).send({ error: 'not_found' });
    db.delete(schema.diaryEntry).where(eq(schema.diaryEntry.id, e.id)).run();
    forgetJudgments(room.id, e.id);
    publish(room.id, { kind: 'member', memberId: member.id }, 'diary:removed', { id: e.id });
    if (!e.private) publish(room.id, { kind: 'gm' }, 'gm:diary.removed', { id: e.id });
    return { ok: true };
  });
}
