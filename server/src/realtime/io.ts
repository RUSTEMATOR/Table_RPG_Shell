import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { type ClientToServerEvents, type ServerToClientEvents } from '@zg/shared';
import { config } from '../config.ts';
import { type AuthContext, SESSION_COOKIE, parseCookieHeader, resolveSession } from '../auth/sessions.ts';
import { registerSyncHandlers } from './handlers/sync.ts';
import { setIo } from './publish.ts';

export interface SocketData {
  auth: AuthContext;
}

export type ZgServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

function originAllowed(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return false;
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
  const io: ZgServer = new Server(app.server, {
    path: '/socket.io/',
    serveClient: false,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    allowRequest: (req, callback) => {
      const ok = originAllowed(req.headers.origin, req.headers.host);
      if (!ok) app.log.warn({ origin: req.headers.origin }, 'socket: чужой Origin');
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
  });

  setIo(io);
  return io;
}
