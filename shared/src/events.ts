import { z } from 'zod';

export const SyncHelloSchema = z.strictObject({
  /** Последний seq, который клиент видел, по каждой своей аудитории. */
  lastSeq: z.partialRecord(z.enum(['public', 'table', 'gm', 'member']), z.number().int().min(0)),
  buildId: z.string().max(100),
});
export type SyncHello = z.infer<typeof SyncHelloSchema>;

export interface SyncWelcome {
  buildId: string;
  reload: boolean;
  /** true — клиент отстал слишком сильно: заменить ленту целиком на events. */
  reset: boolean;
  events: FeedEvent[];
}

import type { GmAck, PlayerCharacter } from './character.ts';
import type { FeedEvent, RollGm, RollPublic } from './feed.ts';

export interface ServerToClientEvents {
  'error:forbidden': (payload: { event: string }) => void;
  /** Игроку: его карточка изменилась (только проекция для игрока). */
  'character:updated': (payload: { character: PlayerCharacter | null }) => void;
  /** Мастеру: персонаж изменился, перечитать. */
  'gm:character.changed': (payload: { id: string }) => void;
  /** Новое событие ленты своей аудитории. */
  'feed:event': (payload: FeedEvent) => void;
  /** Мастеру: сменился противник сессии. */
  'gm:session.changed': () => void;
}

type Ack = (res: GmAck) => void;

export interface ClientToServerEvents {
  'sync:hello': (payload: SyncHello, ack: (welcome: SyncWelcome) => void) => void;
  'gm:trait.setReveal': (payload: unknown, ack: Ack) => void;
  'gm:trait.setStage': (payload: unknown, ack: Ack) => void;
  'gm:trait.setTier': (payload: unknown, ack: Ack) => void;
  'gm:trait.setFork': (payload: unknown, ack: Ack) => void;
  'roll:request': (payload: unknown, ack: (res: { ok: true; roll: RollPublic | RollGm } | { ok: false; error: string }) => void) => void;
  'gm:roll.override': (payload: unknown, ack: Ack) => void;
}
