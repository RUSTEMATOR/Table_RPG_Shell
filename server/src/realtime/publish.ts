import type { Socket } from 'socket.io';
import type { ServerToClientEvents } from '@zg/shared';
import { GmLeakError, findGmLeak } from '../visibility/guard.ts';
import type { ZgServer } from './io.ts';

// Единственное место, откуда события уходят клиентам.
// Прямые socket.emit / io.emit в остальном коде запрещены.

let io: ZgServer | null = null;
export function setIo(server: ZgServer) {
  io = server;
}

export type Audience =
  | { kind: 'public' }
  | { kind: 'table' }
  | { kind: 'gm' }
  | { kind: 'member'; memberId: string };

function roomName(roomId: string, a: Audience): string {
  return a.kind === 'member' ? `${roomId}:member:${a.memberId}` : `${roomId}:${a.kind}`;
}

function guard(where: string, toGmOnly: boolean, payload: unknown) {
  if (toGmOnly) return;
  const reason = findGmLeak(JSON.stringify(payload));
  if (reason) throw new GmLeakError(where, reason);
}

export function publish<E extends keyof ServerToClientEvents>(
  roomId: string,
  audience: Audience,
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  if (!io) throw new Error('Socket.IO не запущен');
  guard(`publish ${event}`, audience.kind === 'gm', args);
  io.to(roomName(roomId, audience)).emit(event, ...args);
}

/** Ответ на ack одного сокета — тоже через предохранитель. */
export function safeAck<T>(socket: Socket, where: string, ack: (payload: T) => void, payload: T): void {
  const auth = socket.data.auth as { member: { role: 'gm' | 'player' | 'table' } };
  guard(`ack ${where}`, auth.member.role === 'gm', payload);
  ack(payload);
}

/** Сообщение одному сокету о запрете действия. */
export function replyForbidden(socket: Socket, event: string): void {
  socket.emit('error:forbidden', { event });
}
