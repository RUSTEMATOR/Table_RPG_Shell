import type { Socket } from 'socket.io';
import { SyncHelloSchema, SyncWelcomeSchema } from '@zg/shared';
import { BUILD_ID } from '../../config.ts';
import { safeAck } from '../publish.ts';

export function registerSyncHandlers(socket: Socket) {
  socket.on('sync:hello', (raw: unknown, ack: unknown) => {
    if (typeof ack !== 'function') return;
    const hello = SyncHelloSchema.safeParse(raw);
    const reload = hello.success ? hello.data.buildId !== BUILD_ID : false;
    // Лента событий появится на этапе 3; пока seq всегда 0.
    safeAck(socket, 'sync:hello', ack as (p: unknown) => void, SyncWelcomeSchema.parse({ buildId: BUILD_ID, reload, seq: 0 }));
  });
}
