import { z } from 'zod';

// ---- Броски и лента ----

export const DICE = ['d10', 'd20'] as const;
export const DiceSchema = z.enum(DICE);

/** Исход d10 по таблице и эффект после поправки на разницу сил. */
export const EFFECTS = [
  'complication',
  'fail',
  'success',
  'strong',
  'crit',
  'scratch',
  'crit_damage',
  'notable_damage',
  'luck',
] as const;
export const EffectSchema = z.enum(EFFECTS);
export type Effect = z.infer<typeof EffectSchema>;

export const EFFECT_LABELS: Record<Effect, string> = {
  complication: 'Провал с осложнением',
  fail: 'Провал',
  success: 'Успех',
  strong: 'Сильный успех',
  crit: 'Критический успех',
  scratch: 'Лишь царапина',
  crit_damage: 'Критический урон',
  notable_damage: 'Заметный урон',
  luck: 'Бросок удачи',
};

/** Кто видит бросок: всем, игроку и мастеру, только мастеру (скрытый бросок мастера). */
export const RollVisibilitySchema = z.enum(['public', 'gm_and_me', 'gm_hidden']);
export type RollVisibility = z.infer<typeof RollVisibilitySchema>;

export const RollRequestSchema = z.strictObject({
  clientRequestId: z.string().min(8).max(64),
  kind: DiceSchema,
  visibility: RollVisibilitySchema,
  label: z.string().trim().max(300).default(''),
});
export type RollRequest = z.input<typeof RollRequestSchema>;

/** Бросок, как его видят игроки и стол. */
export const RollPublicSchema = z.strictObject({
  id: z.string(),
  at: z.number(),
  who: z.string(),
  character: z.string().optional(),
  kind: DiceSchema,
  value: z.number().int(),
  effect: EffectSchema,
  label: z.string().optional(),
  private: z.boolean(),
  corrected: z.boolean(),
});
export type RollPublic = z.infer<typeof RollPublicSchema>;

/** Бросок для мастера: всё, включая силы и исправления. */
export interface RollGm {
  id: string;
  at: number;
  who: string;
  memberId: string;
  character?: string;
  kind: 'd10' | 'd20';
  value: number;
  visibility: RollVisibility;
  label?: string;
  outcome: Effect;
  effect: Effect;
  ruleText: string;
  myPower: number;
  myBand: string;
  enemyName?: string;
  enemyPower?: number;
  enemyBand?: string;
  corrected: boolean;
  correctionNote?: string;
}

export const AUDIENCES = ['public', 'table', 'gm', 'member'] as const;
export const AudienceKeySchema = z.enum(AUDIENCES);
export type AudienceKey = z.infer<typeof AudienceKeySchema>;

/** Событие ленты: seq свой у каждой аудитории, поэтому у игрока нет пропусков. */
export interface FeedEvent {
  aud: AudienceKey;
  seq: number;
  type: 'roll';
  roll: RollPublic | RollGm;
}

export const RollOverrideSchema = z.strictObject({
  rollId: z.string().min(1).max(64),
  effect: EffectSchema,
  note: z.string().max(300).default(''),
});

export const OpponentSchema = z.strictObject({
  name: z.string().trim().max(120).default(''),
  power: z.number().int().min(1).max(99999).nullable(),
});

export interface GmSessionView {
  id: string;
  startedAt: number;
  opponentName: string;
  opponentPower: number | null;
  opponentBand: string;
}
