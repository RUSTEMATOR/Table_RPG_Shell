import type { Socket } from 'socket.io';
import { SyncHelloSchema, type SyncWelcome } from '@zg/shared';
import type { AuthContext } from '../../auth/sessions.ts';
import { BUILD_ID } from '../../config.ts';
import { catchUp } from '../feed.ts';
import { safeAck } from '../publish.ts';
import { on } from '../guarded.ts';

export function registerSyncHandlers(socket: Socket) {
  on(socket, 'sync:hello', (raw: unknown, ack: unknown) => {
    if (typeof ack !== 'function') return;
    const auth = socket.data.auth as AuthContext;
    const hello = SyncHelloSchema.safeParse(raw);
    const lastSeq = hello.success ? hello.data.lastSeq : {};
    const reload = hello.success ? hello.data.buildId !== BUILD_ID : false;
    const { reset, events } = catchUp(auth, lastSeq);
    const welcome: SyncWelcome = { buildId: BUILD_ID, reload, reset, events };
    safeAck(socket, 'sync:hello', ack as (p: SyncWelcome) => void, welcome);
  });
}
