import type { Socket } from 'socket.io';
import { RollOverrideSchema, RollRequestSchema, type GmAck } from '@zg/shared';
import type { AuthContext } from '../../auth/sessions.ts';
import { ALLOWED_VISIBILITY, createRoll, overrideRoll, rerollError, rollFor } from '../../domain/rollService.ts';
import { log } from '../log.ts';
import { replyForbidden, safeAck } from '../publish.ts';
import { findGmLeak } from '../../visibility/guard.ts';
import { on } from '../guarded.ts';

export function registerRollHandlers(socket: Socket) {
  on(socket, 'roll:request', (raw: unknown, ack: unknown) => {
    const auth = socket.data.auth as AuthContext;
    if (typeof ack !== 'function') return;
    const reply = (res: unknown) => safeAck(socket, 'roll:request', ack as (r: unknown) => void, res);
    if (auth.member.role === 'table') return reply({ ok: false, error: 'forbidden' });
    const req = RollRequestSchema.safeParse(raw);
    if (!req.success) return reply({ ok: false, error: 'bad_request' });
    if (!ALLOWED_VISIBILITY[auth.member.role].includes(req.data.visibility)) return reply({ ok: false, error: 'bad_visibility' });
    if (findGmLeak(JSON.stringify(req.data.label))) return reply({ ok: false, error: 'bad_request' });
    if (req.data.rerollOf) {
      const err = rerollError(auth, req.data.rerollOf);
      if (err) return reply({ ok: false, error: err });
    }
    const row = createRoll(auth, req.data);
    reply({ ok: true, roll: rollFor(auth, row) });
  });

  on(socket, 'gm:roll.override', (raw: unknown, ack: unknown) => {
    const auth = socket.data.auth as AuthContext;
    if (auth.member.role !== 'gm') {
      log().warn({ event: 'gm:roll.override', memberId: auth.member.id }, 'gm: событие без роли мастера');
      replyForbidden(socket, 'gm:roll.override');
      if (typeof ack === 'function') (ack as (r: GmAck) => void)({ ok: false, error: 'forbidden' });
      return;
    }
    if (typeof ack !== 'function') return;
    const reply = (res: GmAck) => safeAck(socket, 'gm:roll.override', ack as (r: GmAck) => void, res);
    const p = RollOverrideSchema.safeParse(raw);
    if (!p.success) return reply({ ok: false, error: 'bad_request' });
    const r = overrideRoll(auth.room.id, p.data.rollId, p.data.effect, p.data.note);
    reply(r ? { ok: true } : { ok: false, error: 'not_found' });
  });
}
