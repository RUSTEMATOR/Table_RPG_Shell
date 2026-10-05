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

export interface ServerToClientEvents {
  'error:forbidden': (payload: { event: string }) => void;
}

export interface ClientToServerEvents {
  'sync:hello': (payload: SyncHello, ack: (welcome: SyncWelcome) => void) => void;
}
