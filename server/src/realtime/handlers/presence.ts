import type { Socket } from 'socket.io';
import { PlayerActivitySchema } from '@zg/shared';
import type { AuthContext } from '../../auth/sessions.ts';
import { RateLimiter } from '../../auth/rateLimit.ts';
import { on } from '../guarded.ts';
import { log } from '../log.ts';
import { presenceConnect, presenceDisconnect, presenceUpdate } from '../presence.ts';

// Клиент шлёт с задержкой и только при изменении; это — предохранитель от зацикленного или чужого клиента.
const activityLimit = new RateLimiter(120, 60_000);

/** Активность игрока: что у него открыто. Мастер и стол сюда не попадают. */
export function registerPresenceHandlers(socket: Socket) {
  const auth = socket.data.auth as AuthContext;
  if (auth.member.role !== 'player') return;
  const roomId = auth.room.id;
  const memberId = auth.member.id;
  presenceConnect(roomId, memberId, socket.id);

  on(socket, 'player:activity', (raw: unknown) => {
    if (activityLimit.blockedFor(memberId)) return;
    activityLimit.hit(memberId);
    const a = PlayerActivitySchema.safeParse(raw);
    if (!a.success) {
      log().warn({ memberId }, 'player:activity: неверный формат');
      return;
    }
    presenceUpdate(roomId, memberId, socket.id, a.data);
  });

  socket.on('disconnect', () => {
    try {
      presenceDisconnect(roomId, memberId, socket.id);
    } catch (err) {
      log().error({ err }, 'presence: ошибка при отключении');
    }
  });
}
