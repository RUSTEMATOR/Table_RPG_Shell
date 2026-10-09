import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { type ClientToServerEvents, type ServerToClientEvents } from '@zg/shared';
import { config } from '../config.ts';
import { type AuthContext, SESSION_COOKIE, parseCookieHeader, resolveSession } from '../auth/sessions.ts';
import { registerGmTraitHandlers } from './handlers/gmTraits.ts';
import { registerPresenceHandlers } from './handlers/presence.ts';
import { registerReactionHandlers } from './handlers/reactions.ts';
import { registerRollHandlers } from './handlers/rolls.ts';
import { registerSyncHandlers } from './handlers/sync.ts';
import { setLogger } from './log.ts';
import { setIo } from './publish.ts';

export interface SocketData {
  auth: AuthContext;
}

export type ZgServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  // Браузер не шлёт Origin в GET на свой же сайт (первый запрос polling Socket.IO).
  // Межсайтовые запросы и WebSocket Origin несут всегда, так что его отсутствие — свой сайт
  // или не браузер; вход всё равно требует cookie сессии.
  if (!origin) return true;
  if (config.PUBLIC_ORIGIN && origin === config.PUBLIC_ORIGIN) return true;
  try {
    // За nginx и за прокси Vite Host совпадает с хостом страницы.
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function audienceRooms(auth: AuthContext): string[] {
  const r = auth.room.id;
  switch (auth.member.role) {
    case 'gm':
      return [`${r}:public`, `${r}:gm`];
    case 'table':
      return [`${r}:public`, `${r}:table`];
    case 'player':
      return [`${r}:public`, `${r}:member:${auth.member.id}`];
  }
}

export function attachSocketIo(app: FastifyInstance): ZgServer {
  setLogger(app.log);
  const io: ZgServer = new Server(app.server, {
    path: '/socket.io/',
    serveClient: false,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    allowRequest: (req, callback) => {
      const ok = originAllowed(req.headers.origin, req.headers.host);
      if (!ok) app.log.warn({ origin: req.headers.origin, host: req.headers.host }, 'socket: чужой Origin');
      callback(null, ok);
    },
  });

  io.use((socket, next) => {
    const token = parseCookieHeader(socket.request.headers.cookie, SESSION_COOKIE);
    const auth = resolveSession(token);
    if (!auth) return next(new Error('unauthorized'));
    socket.data.auth = auth;
    next();
  });

  io.on('connection', (socket) => {
    void socket.join(audienceRooms(socket.data.auth));
    registerSyncHandlers(socket);
    registerGmTraitHandlers(socket);
    registerRollHandlers(socket);
    registerPresenceHandlers(socket);
    registerReactionHandlers(socket);
  });

  setIo(io);
  return io;
}
