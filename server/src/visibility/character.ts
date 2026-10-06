import { PlayerCharacterSchema, type PlayerCharacter } from '@zg/shared';
import { cardOf, catLabel, effSteps, originOf, powerBand, powerOf, stepText } from '../domain/cards.ts';
import { int04, normRevealed, pronounWord } from '../domain/character.ts';
import type { LoadedCharacter } from '../domain/repo.ts';
import { craftOf } from '../domain/randomizer.ts';
import { playerSheet } from '../domain/sheet.ts';
import { TRAITS } from '../domain/traits.ts';
import { portraitUrl } from '../domain/portrait.ts';

// Единственное место, где персонаж превращается в то, что видит игрок (перенос toPublic §2.3).
// Берём только раскрытое, по белому списку полей; скрытые черты не оставляют ни записи, ни счётчика.
// На выходе — PlayerCharacterSchema.parse (strictObject на всех уровнях): лишнее поле — исключение.

export function projectForPlayer({ row, doc }: LoadedCharacter): PlayerCharacter {
  const traits: PlayerCharacter['traits'] = [];
  const hints: string[] = [];
  for (const sl of doc.slots) {
    if (!TRAITS[sl.traitId]) continue;
    const rv = normRevealed(sl.revealed);
    const hint = rv.hint.trim().slice(0, 300);
    if (!rv.trait) {
      if (hint) hints.push(hint);
      continue;
    }
    const card = cardOf(sl);
    const k = Math.min(rv.stages, int04(sl.stage));
    const t = TRAITS[sl.traitId]!;
    traits.push({
      cat: catLabel(sl),
      catKey: sl.cat,
      ...(sl.cat === 'setting' ? { setting: { universe: t.universe ?? '', genre: t.genre ?? '' } } : {}),
      name: card.name,
      d: card.d,
      stagesShown: effSteps(card, sl).slice(0, k).map(stepText),
      ...(rv.price && card.price ? { price: card.price } : {}),
      ...(hint ? { hint } : {}),
    });
  }
  const cr = row.kind === 'popadanets' ? craftOf(doc) : null;
  const ps = doc.summary?.player;
  const pc = doc.summary?.crossing;
  return PlayerCharacterSchema.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    pronoun: pronounWord(doc.pronoun),
    origin: row.kind === 'popadanets' ? originOf(doc) : '',
    look: { theme: doc.cardTheme ?? '', universe: doc.universe ?? '', genre: doc.source ?? '' },
    ...(doc.image ? { portrait: portraitUrl(row.id, doc.image) } : {}),
    ...(doc.figure ? { figure: doc.figure } : {}),
    ...(row.publicBio.trim() ? { bio: row.publicBio.slice(0, 4000) } : {}),
    ...(doc.showPower === true ? { powerBand: powerBand(powerOf(doc)).name } : {}),
    ...(cr ? { profession: { label: cr.label, local: cr.local, demand: Math.max(0, Math.min(3, Math.trunc(cr.demand))), edge: cr.edge } } : {}),
    ...(ps?.show === true && ps.text?.trim() ? { summary: ps.text.slice(0, 4000) } : {}),
    ...(pc?.show === true && pc.text?.trim() ? { crossing: pc.text.slice(0, 4000) } : {}),
    traits,
    hints,
    ...playerSheet(row.id),
  });
}
