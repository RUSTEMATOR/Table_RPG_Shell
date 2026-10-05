import { eq } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { config } from '../config.ts';
import { db, schema } from '../db/client.ts';
import { newToken, sha256 } from './tokens.ts';

export const SESSION_COOKIE = 'zg_sid';
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 10 * 60 * 1000;

export interface AuthContext {
  sessionId: string;
  member: { id: string; name: string; role: 'gm' | 'player' | 'table'; roomId: string };
  room: { id: string; name: string; code: string };
}

export function createSession(reply: FastifyReply, memberId: string): void {
  const token = newToken();
  const now = Date.now();
  db.insert(schema.authSession)
    .values({ id: sha256(token), memberId, createdAt: now, expiresAt: now + SESSION_TTL_MS, lastSeenAt: now })
    .run();
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function destroySession(reply: FastifyReply, sessionId: string | undefined): void {
  if (sessionId) db.delete(schema.authSession).where(eq(schema.authSession.id, sessionId)).run();
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function resolveSession(token: string | undefined): AuthContext | null {
  if (!token) return null;
  const id = sha256(token);
  const row = db
    .select({ s: schema.authSession, m: schema.member, r: schema.room })
    .from(schema.authSession)
    .innerJoin(schema.member, eq(schema.member.id, schema.authSession.memberId))
    .innerJoin(schema.room, eq(schema.room.id, schema.member.roomId))
    .where(eq(schema.authSession.id, id))
    .get();
  if (!row) return null;
  const now = Date.now();
  if (row.s.expiresAt <= now) {
    db.delete(schema.authSession).where(eq(schema.authSession.id, id)).run();
    return null;
  }
  if (now - row.s.lastSeenAt > TOUCH_EVERY_MS) {
    db.update(schema.authSession).set({ lastSeenAt: now }).where(eq(schema.authSession.id, id)).run();
  }
  return {
    sessionId: id,
    member: { id: row.m.id, name: row.m.name, role: row.m.role, roomId: row.m.roomId },
    room: { id: row.r.id, name: row.r.name, code: row.r.code },
  };
}

export function parseCookieHeader(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx < 0) continue;
    if (part.slice(0, eqIdx).trim() === name) return decodeURIComponent(part.slice(eqIdx + 1).trim());
  }
  return undefined;
}
