import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  GmPasswordSchema,
  InviteAcceptSchema,
  InviteInfoSchema,
  LoginMembersSchema,
  LoginRequestSchema,
  MeSchema,
  PinSchema,
  RoomCodeSchema,
} from '@zg/shared';
import { db, schema } from '../db/client.ts';
import { ipAttempts, memberFailures } from './rateLimit.ts';
import { burnTime, hashSecret, verifySecret } from './secrets.ts';
import { createSession, destroySession } from './sessions.ts';
import { sha256 } from './tokens.ts';

function tooMany(reply: FastifyReply, retryAfterSec: number) {
  return reply.code(429).header('retry-after', String(retryAfterSec)).send({ error: 'rate_limited', retryAfterSec });
}

function checkIp(request: FastifyRequest, reply: FastifyReply): boolean {
  const key = `ip:${request.ip}`;
  const wait = ipAttempts.blockedFor(key);
  if (wait > 0) {
    request.log.warn({ ip: request.ip }, 'auth: лимит попыток с IP');
    tooMany(reply, wait);
    return false;
  }
  ipAttempts.hit(key);
  return true;
}

function findInvite(token: string) {
  return db.select().from(schema.member).where(eq(schema.member.inviteTokenHash, sha256(token))).get();
}

function inviteState(m: ReturnType<typeof findInvite>): 'ok' | 'used' | 'expired' | 'missing' {
  if (!m) return 'missing';
  if (m.inviteUsedAt) return 'used';
  if (!m.inviteExpiresAt || m.inviteExpiresAt < Date.now()) return 'expired';
  return 'ok';
}

const INVITE_ERRORS = { missing: 404, used: 410, expired: 410 } as const;

export async function authRoutes(app: FastifyInstance) {
  // GET ничего не меняет: превью-боты мессенджеров открывают ссылку сами.
  app.get<{ Params: { token: string } }>('/api/auth/invite/:token', async (request, reply) => {
    if (!checkIp(request, reply)) return;
    const m = findInvite(request.params.token);
    const state = inviteState(m);
    if (state !== 'ok' || !m) return reply.code(INVITE_ERRORS[state === 'ok' ? 'missing' : state]).send({ error: `invite_${state}` });
    const room = db.select().from(schema.room).where(eq(schema.room.id, m.roomId)).get();
    return InviteInfoSchema.parse({
      name: m.name,
      role: m.role,
      roomName: room?.name ?? '',
      needsSecret: m.role !== 'table',
    });
  });

  app.post<{ Params: { token: string } }>('/api/auth/invite/:token', async (request, reply) => {
    if (!checkIp(request, reply)) return;
    const body = InviteAcceptSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const m = findInvite(request.params.token);
    const state = inviteState(m);
    if (state !== 'ok' || !m) return reply.code(INVITE_ERRORS[state === 'ok' ? 'missing' : state]).send({ error: `invite_${state}` });

    let secretHash = m.secretHash;
    if (m.role !== 'table') {
      const secretSchema = m.role === 'gm' ? GmPasswordSchema : PinSchema;
      const secret = secretSchema.safeParse(body.data.secret);
      if (!secret.success) return reply.code(400).send({ error: 'bad_secret' });
      secretHash = await hashSecret(secret.data);
    }
    // Гасим атомарно: повторный POST той же ссылкой не пройдёт.
    const res = db
      .update(schema.member)
      .set({ inviteUsedAt: Date.now(), secretHash })
      .where(and(eq(schema.member.id, m.id), eq(schema.member.inviteTokenHash, m.inviteTokenHash!)))
      .run();
    if (res.changes !== 1) return reply.code(410).send({ error: 'invite_used' });
    memberFailures.reset(`m:${m.id}`);
    createSession(reply, m.id);
    return { ok: true, role: m.role };
  });

  app.get<{ Params: { code: string } }>('/api/auth/room/:code', async (request, reply) => {
    if (!checkIp(request, reply)) return;
    const code = RoomCodeSchema.safeParse(request.params.code);
    if (!code.success) return reply.code(404).send({ error: 'room_not_found' });
    const room = db.select().from(schema.room).where(eq(schema.room.code, code.data)).get();
    if (!room) return reply.code(404).send({ error: 'room_not_found' });
    const members = db
      .select({ id: schema.member.id, name: schema.member.name, role: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.roomId, room.id), inArray(schema.member.role, ['gm', 'player'])))
      .all();
    return LoginMembersSchema.parse({ roomName: room.name, members });
  });

  app.post('/api/auth/login', async (request, reply) => {
    if (!checkIp(request, reply)) return;
    const body = LoginRequestSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const { roomCode, memberId, secret } = body.data;
    const failKey = `m:${memberId}`;
    const wait = memberFailures.blockedFor(failKey);
    if (wait > 0) {
      request.log.warn({ memberId, ip: request.ip }, 'auth: участник временно заблокирован');
      return tooMany(reply, wait);
    }
    const row = db
      .select({ m: schema.member })
      .from(schema.member)
      .innerJoin(schema.room, eq(schema.room.id, schema.member.roomId))
      .where(and(eq(schema.member.id, memberId), eq(schema.room.code, roomCode)))
      .get();
    const ok = row && row.m.role !== 'table' ? await verifySecret(row.m.secretHash, secret) : (await burnTime(secret), false);
    if (!ok || !row) {
      memberFailures.hit(failKey);
      request.log.info({ memberId, ip: request.ip }, 'auth: неверный вход');
      return reply.code(401).send({ error: 'bad_credentials' });
    }
    memberFailures.reset(failKey);
    createSession(reply, row.m.id);
    return { ok: true, role: row.m.role };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    destroySession(reply, request.auth?.sessionId);
    return { ok: true };
  });

  app.get('/api/me', async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: 'unauthorized' });
    const { member, room } = request.auth;
    return MeSchema.parse({
      member: { id: member.id, name: member.name, role: member.role },
      room: { name: room.name, code: room.code },
    });
  });
}
