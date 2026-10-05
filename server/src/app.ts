import cookie from '@fastify/cookie';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { authRoutes } from './auth/routes.ts';
import { gmRoutes } from './auth/gmRoutes.ts';
import { type AuthContext, SESSION_COOKIE, resolveSession } from './auth/sessions.ts';
import { BUILD_ID, config } from './config.ts';
import { jevRoutes } from './ai/jev/routes.ts';
import { gmCharacterRoutes } from './routes/gmCharacters.ts';
import { playerRoutes } from './routes/player.ts';
import { findGmLeak } from './visibility/guard.ts';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export async function buildApp() {
  const logger: FastifyServerOptions['logger'] = {
    level: config.LOG_LEVEL,
    redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  };
  const app = Fastify({ logger, trustProxy: '127.0.0.1', bodyLimit: 15 * 1024 * 1024 });

  await app.register(cookie);
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request, reply) => {
    request.auth = resolveSession(request.cookies[SESSION_COOKIE]);
    if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });

  // Предохранитель: ответы не-мастеру проверяются на маркер и мастерские ключи.
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.auth?.member.role === 'gm') return payload;
    if (typeof payload !== 'string') return payload;
    const reason = findGmLeak(payload);
    if (!reason) return payload;
    request.log.error({ url: request.url, reason, memberId: request.auth?.member.id }, 'УТЕЧКА: ответ заблокирован');
    reply.code(500).header('content-type', 'application/json; charset=utf-8');
    return JSON.stringify({ error: 'blocked' });
  });

  app.get('/api/healthz', async () => ({ ok: true, build: BUILD_ID }));

  await app.register(authRoutes);
  await app.register(gmRoutes);
  await app.register(jevRoutes);
  await app.register(gmCharacterRoutes);
  await app.register(playerRoutes);

  return app;
}
