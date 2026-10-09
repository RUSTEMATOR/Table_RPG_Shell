import type { Socket } from 'socket.io';
import { ReactSchema, TableReactionSchema } from '@zg/shared';
import type { AuthContext } from '../../auth/sessions.ts';
import { RateLimiter } from '../../auth/rateLimit.ts';
import { loadOwnedCharacter } from '../../domain/repo.ts';
import { on } from '../guarded.ts';
import { publish } from '../publish.ts';

// Отклики на стол (этап 52): только игроки, не чаще 6 за 10 секунд, лишние молча отбрасываются. Нигде не хранятся.
const limit = new RateLimiter(6, 10_000);

export function registerReactionHandlers(socket: Socket) {
  const auth = socket.data.auth as AuthContext;
  if (auth.member.role !== 'player') return;
  on(socket, 'player:react', (raw: unknown) => {
    const memberId = auth.member.id;
    if (limit.blockedFor(memberId)) return;
    const r = ReactSchema.safeParse(raw);
    if (!r.success) return;
    limit.hit(memberId);
    const who = loadOwnedCharacter(auth.room.id, memberId)?.row.name ?? auth.member.name;
    publish(auth.room.id, { kind: 'table' }, 'table:reaction', TableReactionSchema.parse({ kind: r.data.kind, who, at: Date.now() }));
  });
}
