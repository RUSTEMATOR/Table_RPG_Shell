import { z } from 'zod';

export const SyncHelloSchema = z.strictObject({
  lastSeq: z.number().int().min(0),
  buildId: z.string().max(100),
});
export type SyncHello = z.infer<typeof SyncHelloSchema>;

export const SyncWelcomeSchema = z.strictObject({
  buildId: z.string(),
  reload: z.boolean(),
  seq: z.number().int().min(0),
});
export type SyncWelcome = z.infer<typeof SyncWelcomeSchema>;

import type { GmAck, PlayerCharacter } from './character.ts';

export interface ServerToClientEvents {
  'error:forbidden': (payload: { event: string }) => void;
  /** Игроку: его карточка изменилась (только проекция для игрока). */
  'character:updated': (payload: { character: PlayerCharacter | null }) => void;
  /** Мастеру: персонаж изменился, перечитать. */
  'gm:character.changed': (payload: { id: string }) => void;
}

type Ack = (res: GmAck) => void;

export interface ClientToServerEvents {
  'sync:hello': (payload: SyncHello, ack: (welcome: SyncWelcome) => void) => void;
  'gm:trait.setReveal': (payload: unknown, ack: Ack) => void;
  'gm:trait.setStage': (payload: unknown, ack: Ack) => void;
  'gm:trait.setTier': (payload: unknown, ack: Ack) => void;
  'gm:trait.setFork': (payload: unknown, ack: Ack) => void;
}
