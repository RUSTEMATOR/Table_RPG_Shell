import type { FastifyInstance } from 'fastify';
import { ShellGrantSchema, ShellPickSchema } from '@zg/shared';
import { requireGm } from '../auth/requireGm.ts';
import { loadCharacter, loadOwnedCharacter } from '../domain/repo.ts';
import { grantShell, pickShell } from '../domain/shells.ts';
import { characterView } from '../domain/views.ts';
import { notifyCharacterChanged } from '../realtime/notify.ts';
import { projectForPlayer } from '../visibility/character.ts';

// Открываемые оболочки (этап 51): игрок выбирает, мастер дарит открытие.

export async function playerShellRoutes(app: FastifyInstance) {
  app.post('/api/player/shells', async (request, reply) => {
    const auth = request.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    if (auth.member.role !== 'player') return reply.code(403).send({ error: 'forbidden' });
    const b = ShellPickSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const lc = loadOwnedCharacter(auth.room.id, auth.member.id);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    const res = pickShell(lc.row, b.data.shell);
    if (res !== 'ok') return reply.code(409).send({ error: res });
    notifyCharacterChanged(auth.room.id, lc);
    return { character: projectForPlayer(lc) };
  });
}

export async function gmShellRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.post('/api/gm/shells/grant', async (request, reply) => {
    const b = ShellGrantSchema.safeParse(request.body);
    if (!b.success) return reply.code(400).send({ error: 'bad_request' });
    const roomId = request.auth!.room.id;
    const lc = loadCharacter(roomId, b.data.characterId);
    if (!lc) return reply.code(404).send({ error: 'not_found' });
    grantShell(lc.row);
    notifyCharacterChanged(roomId, lc);
    return characterView(lc);
  });
}
