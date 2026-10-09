import { SUMMARY_KINDS, type GmCharacterView, type GmDraftView, type GmSlotView, type GmSummary } from '@zg/shared';
import { momentsForGm } from './moments.ts';
import { sparksForGm } from './sparks.ts';
import { shellsOf } from './shells.ts';
import { ARCHS, GREEN_SIGNS, TIERS } from './data.ts';
import { cardOf, catLabel, combosFor, effSteps, gmLayers, originOf, powerBand, powerOf, stagePowerHint } from './cards.ts';
import { STAGE_NAMES, int04, normRevealed, pronounWord, type CharDoc, type Draft, type Slot } from './character.ts';
import { affinityNote, craftOf } from './randomizer.ts';
import type { LoadedCharacter } from './repo.ts';
import { CAT_LABELS, TRAITS } from './traits.ts';
import { gmSheet, listSheet } from './sheet.ts';
import { projectForPlayer } from '../visibility/character.ts';

// Представления для экрана мастера. Это мастерские данные: уходят только роли gm.

function details(sl: Slot): { label: string; text: string }[] {
  const t = TRAITS[sl.traitId];
  if (!t) return [];
  const r = t.row as unknown[];
  switch (t.cat) {
    case 'class':
      return [{ label: 'Первый сигнал', text: String(r[2]) }];
    case 'green':
      return [
        { label: 'Хранилище', text: String(r[2]) },
        { label: 'Нагрузка', text: String(r[3]) },
        { label: 'Роль', text: String(r[4]) },
      ];
    case 'mark':
    case 'setting':
      return [];
    default:
      return r[2] ? [{ label: 'Как раскрыть', text: String(r[2]) }] : [];
  }
}

export function slotView(sl: Slot, index: number, ctx: Partial<CharDoc> & Pick<CharDoc, 'arch'>, power: number): GmSlotView {
  const card = cardOf(sl);
  const rv = normRevealed(sl.revealed);
  const stage = int04(sl.stage);
  return {
    index,
    traitId: sl.traitId,
    cat: sl.cat,
    catLabel: catLabel(sl),
    kind: sl.kind,
    tier: sl.tier,
    tierLabel: sl.tier === 'fixed' ? 'всегда' : (TIERS[sl.tier] ?? sl.tier),
    name: card.name,
    d: card.d,
    details: details(sl),
    ...(card.price ? { price: card.price } : {}),
    ...(card.hook ? { hook: card.hook } : {}),
    steps: effSteps(card, sl),
    stage,
    stageName: STAGE_NAMES[stage]!,
    fork: sl.fork ?? null,
    forkOptions: card.fork,
    revealed: rv,
    revealLevel: rv.trait ? 'revealed' : rv.hint.trim() ? 'hinted' : 'hidden',
    matched: !!sl.matched,
    manual: !!sl.manual,
    extra: !!sl.extra,
    random: !!sl.random,
    replaced: sl.replaced ? (CAT_LABELS[sl.replaced] ?? sl.replaced) : '',
    affinityNote: affinityNote(sl, ctx),
    stagePowerHint: stage < 4 ? stagePowerHint(power, stage + 1) : '',
    gm: gmLayers(sl, ctx),
    history: sl.history ?? [],
  };
}

function craftView(x: Parameters<typeof craftOf>[0]) {
  const cr = craftOf(x);
  return cr ? { label: cr.label, local: cr.local, demand: cr.demand, edge: cr.edge, hook: cr.hook } : null;
}

const combosView = (x: Pick<CharDoc, 'slots'>) => combosFor(x).map((c) => ({ names: c.names, text: c.text }));

export function draftView(draft: Draft): GmDraftView {
  return {
    draft,
    slots: draft.slots.map((s, i) => slotView(s, i, draft, 10)),
    craft: craftView(draft),
    combos: combosView(draft),
  };
}

export function characterView(lc: LoadedCharacter): GmCharacterView {
  const { row, doc } = lc;
  const power = powerOf(doc);
  return {
    id: row.id,
    figure: doc.figure ?? null,
    kind: row.kind,
    name: row.name,
    ownerMemberId: row.ownerMemberId,
    publicBio: row.publicBio,
    notes: doc.notes,
    pronoun: pronounWord(doc.pronoun),
    origin: row.kind === 'popadanets' ? originOf(doc) : '',
    archLabel: ARCHS.find((a) => a[0] === doc.arch)?.[1] ?? '',
    patron: !!doc.patron,
    seed: doc.seed,
    craft: row.kind === 'popadanets' ? craftView(doc) : null,
    power: { value: power, band: powerBand(power).label, show: doc.showPower === true },
    slots: doc.slots.map((s, i) => slotView(s, i, doc, power)),
    combos: combosView(doc),
    greenSigns: GREEN_SIGNS,
    player: projectForPlayer(lc),
    summaries: row.kind === 'popadanets' ? SUMMARY_KINDS.map((k) => summaryView(doc, k)) : [],
    sheet: gmSheet(listSheet(row.id)),
    moments: momentsForGm(row.id),
    sparks: sparksForGm(row.id),
    shells: shellsOf(row),
  };
}

function summaryView(doc: CharDoc, kind: GmSummary['kind']): GmSummary {
  const e = doc.summary?.[kind] as (NonNullable<CharDoc['summary']>['gm'] & { model?: string }) | undefined;
  return {
    kind,
    text: e?.text ?? '',
    at: e?.at ?? 0,
    edited: !!e?.edited,
    show: kind !== 'gm' && e?.show === true,
    tone: e?.tone ?? '',
    person: e?.person ?? '2',
    model: e?.model ?? '',
  };
}
