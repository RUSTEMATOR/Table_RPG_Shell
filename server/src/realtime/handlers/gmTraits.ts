import type { Socket } from 'socket.io';
import type { z } from 'zod';
import { SetForkSchema, SetRevealSchema, SetStageSchema, SetTierSchema, type GmAck } from '@zg/shared';
import { cardOf, setFork, setReveal, setStage, setTier } from '../../domain/cards.ts';
import type { Slot } from '../../domain/character.ts';
import { loadCharacter, saveDoc } from '../../domain/repo.ts';
import type { AuthContext } from '../../auth/sessions.ts';
import { notifyCharacterChanged } from '../notify.ts';
import { replyForbidden, safeAck } from '../publish.ts';
import { log } from '../log.ts';

// Мастерские действия с чертами. Первая строка каждого обработчика — проверка роли мастера.

function onGm<S extends z.ZodTypeAny>(
  socket: Socket,
  event: string,
  schema: S,
  mutate: (slot: Slot, data: z.infer<S>) => boolean,
) {
  socket.on(event, (raw: unknown, ack: unknown) => {
    const auth = socket.data.auth as AuthContext;
    if (auth.member.role !== 'gm') {
      log().warn({ event, memberId: auth.member.id, role: auth.member.role }, 'gm: событие без роли мастера');
      replyForbidden(socket, event);
      if (typeof ack === 'function') (ack as (r: GmAck) => void)({ ok: false, error: 'forbidden' });
      return;
    }
    const reply = (res: GmAck) => {
      if (typeof ack === 'function') safeAck(socket, event, ack as (r: GmAck) => void, res);
    };
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return reply({ ok: false, error: 'bad_request' });
    const data = parsed.data as z.infer<S> & { characterId: string; slot: number };
    const lc = loadCharacter(auth.room.id, data.characterId);
    const slot = lc?.doc.slots[data.slot];
    if (!lc || !slot) return reply({ ok: false, error: 'not_found' });
    if (!mutate(slot, data)) return reply({ ok: true });
    saveDoc(lc.row.id, lc.doc);
    notifyCharacterChanged(auth.room.id, lc);
    reply({ ok: true });
  });
}

export function registerGmTraitHandlers(socket: Socket) {
  onGm(socket, 'gm:trait.setReveal', SetRevealSchema, (sl, d) => {
    const patch: Parameters<typeof setReveal>[1] = {};
    if (d.patch.trait !== undefined) patch.trait = d.patch.trait;
    if (d.patch.stages !== undefined) patch.stages = d.patch.stages;
    if (d.patch.price !== undefined) patch.price = d.patch.price;
    if (d.patch.hint !== undefined) patch.hint = d.patch.hint;
    return setReveal(sl, patch);
  });
  onGm(socket, 'gm:trait.setStage', SetStageSchema, (sl, d) => setStage(sl, d.stage));
  onGm(socket, 'gm:trait.setTier', SetTierSchema, (sl, d) => setTier(sl, d.tier, d.reason));
  onGm(socket, 'gm:trait.setFork', SetForkSchema, (sl, d) => setFork(sl, cardOf(sl), d.fork));
}
