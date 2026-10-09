import { z } from 'zod';

// Отклики на стол (этап 52): фиксированный перечень, не свободный текст. Нигде не хранятся.

export const REACTIONS = ['awe', 'dread', 'laugh', 'cheer'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const REACTION_LABELS: Record<Reaction, string> = { awe: 'Ох!', dread: 'Брр…', laugh: 'Ха!', cheer: 'Ура!' };

export const ReactSchema = z.strictObject({ kind: z.enum(REACTIONS) });
export const TableReactionSchema = z.strictObject({ kind: z.enum(REACTIONS), who: z.string(), at: z.number() });
export type TableReaction = z.infer<typeof TableReactionSchema>;
