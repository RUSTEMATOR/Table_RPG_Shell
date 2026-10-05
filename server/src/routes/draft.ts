import { z } from 'zod';
import { TIER_KEYS } from '../domain/data.ts';
import { MAX_SLOTS, type Draft, type Slot } from '../domain/character.ts';
import { TRAITS } from '../domain/traits.ts';

// Черновик приходит с экрана мастера. Доверяем только traitId и флагам; kind/cat берём из справочника.

const SlotIn = z.object({
  traitId: z.string().max(120),
  tier: z.string().max(20).optional(),
  matched: z.boolean().optional(),
  replaced: z.string().max(40).optional(),
  manual: z.boolean().optional(),
  extra: z.boolean().optional(),
  random: z.boolean().optional(),
  affinity: z.enum(['profession', 'arch']).optional(),
});

export const DraftSchema = z.object({
  seed: z.string().min(1).max(64),
  name: z.string().max(120),
  pronoun: z.string().max(10),
  source: z.string().max(40),
  universe: z.string().max(40),
  arch: z.string().max(40),
  patron: z.boolean(),
  profession: z.string().max(40),
  professionText: z.string().max(80),
  slots: z.array(SlotIn).min(1).max(MAX_SLOTS),
  rerolls: z.array(z.number().int().min(0).max(10000)).max(MAX_SLOTS),
  extraRolls: z.number().int().min(0).max(10000).optional(),
});

export function normalizeDraft(input: z.infer<typeof DraftSchema>): Draft | null {
  const slots: Slot[] = [];
  for (const s of input.slots) {
    const t = TRAITS[s.traitId];
    if (!t) return null;
    const tier = (TIER_KEYS as readonly string[]).includes(s.tier ?? '') || s.tier === 'fixed' ? (s.tier as Slot['tier']) : t.tier;
    const slot: Slot = { kind: t.kind, cat: t.cat, traitId: t.id, tier };
    if (s.matched) slot.matched = true;
    if (s.replaced) slot.replaced = s.replaced;
    if (s.manual) slot.manual = true;
    if (s.extra) slot.extra = true;
    if (s.random) slot.random = true;
    if (s.affinity) slot.affinity = s.affinity;
    slots.push(slot);
  }
  return {
    seed: input.seed,
    name: input.name,
    pronoun: input.pronoun,
    source: input.source,
    universe: input.universe,
    arch: input.arch,
    patron: input.patron,
    profession: input.profession,
    professionText: input.professionText,
    slots,
    rerolls: slots.map((_, i) => input.rerolls[i] ?? 0),
    ...(input.extraRolls ? { extraRolls: input.extraRolls } : {}),
  };
}
