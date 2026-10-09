import cookie from '@fastify/cookie';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { authRoutes } from './auth/routes.ts';
import { gmRoutes } from './auth/gmRoutes.ts';
import { type AuthContext, SESSION_COOKIE, resolveSession } from './auth/sessions.ts';
import { BUILD_ID, config } from './config.ts';
import { jevRoutes } from './ai/jev/routes.ts';
import { gmCharacterRoutes } from './routes/gmCharacters.ts';
import { playerRoutes } from './routes/player.ts';
import { gmSessionRoutes } from './routes/gmSession.ts';
import { gmPresenceRoutes } from './routes/gmPresence.ts';
import { gmScreenRoutes } from './routes/gmScreen.ts';
import { playerDiaryRoutes } from './routes/playerDiary.ts';
import { gmNpcRoutes } from './routes/npcs.ts';
import { gmSheetRoutes, playerSheetRoutes } from './routes/sheet.ts';
import { gmSceneRoutes, tableRoutes } from './routes/scenes.ts';
import { summaryRoutes } from './routes/summaries.ts';
import { statusRoutes } from './routes/status.ts';
import { gmMapRoutes, playerMapRoutes, tableMapRoutes } from './routes/maps.ts';
import { gmPlaceRoutes, publicPlaceRoutes } from './routes/places.ts';
import { pushRoutes } from './routes/push.ts';
import { gmLetterRoutes, playerLetterRoutes } from './routes/letters.ts';
import { gmChronicleRoutes, playerChronicleRoutes } from './routes/chronicle.ts';
import { gmDowntimeRoutes, playerDowntimeRoutes } from './routes/downtime.ts';
import { gmScheduleRoutes, playerScheduleRoutes, scheduleIcsRoutes } from './routes/schedule.ts';
import { gmMomentRoutes } from './routes/moments.ts';
import { gmSparkRoutes, playerSparkRoutes } from './routes/sparks.ts';
import { playerAcquaintanceRoutes } from './routes/acquaintances.ts';
import { gmBestiaryRoutes, playerBestiaryRoutes } from './routes/bestiary.ts';
import { gmShellRoutes, playerShellRoutes } from './routes/shells.ts';
import { gmSearchRoutes } from './routes/search.ts';
import { gmQuestionnaireRoutes, playerQuestionnaireRoutes } from './routes/questionnaire.ts';
import { gmDatabaseRoutes } from './routes/database.ts';
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
    if (request.url.startsWith('/api/') && !request.url.startsWith('/api/media/')) reply.header('cache-control', 'no-store');
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
  await app.register(gmSessionRoutes);
  await app.register(gmPresenceRoutes);
  await app.register(pushRoutes);
  await app.register(playerLetterRoutes);
  await app.register(gmLetterRoutes);
  await app.register(playerChronicleRoutes);
  await app.register(gmChronicleRoutes);
  await app.register(playerDowntimeRoutes);
  await app.register(gmDowntimeRoutes);
  await app.register(playerScheduleRoutes);
  await app.register(gmScheduleRoutes);
  await app.register(scheduleIcsRoutes);
  await app.register(gmMomentRoutes);
  await app.register(playerSparkRoutes);
  await app.register(gmSparkRoutes);
  await app.register(playerAcquaintanceRoutes);
  await app.register(playerBestiaryRoutes);
  await app.register(gmBestiaryRoutes);
  await app.register(playerShellRoutes);
  await app.register(gmShellRoutes);
  await app.register(gmSearchRoutes);
  await app.register(playerQuestionnaireRoutes);
  await app.register(gmQuestionnaireRoutes);
  await app.register(gmDatabaseRoutes);
  await app.register(gmScreenRoutes);
  await app.register(playerDiaryRoutes);
  await app.register(gmSceneRoutes);
  await app.register(gmNpcRoutes);
  await app.register(gmSheetRoutes);
  await app.register(playerSheetRoutes);
  await app.register(tableRoutes);
  await app.register(summaryRoutes);
  await app.register(statusRoutes);
  await app.register(gmMapRoutes);
  await app.register(playerMapRoutes);
  await app.register(tableMapRoutes);
  await app.register(gmPlaceRoutes);
  await app.register(publicPlaceRoutes);

  return app;
}
