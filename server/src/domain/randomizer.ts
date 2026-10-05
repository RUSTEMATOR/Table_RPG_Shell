import { ARCH_MATCH, ARCHS, CATS, CAT_DATA, CLASSES, GREEN, PROFESSIONS, SETTING, TIER_KEYS, UNIVERSES, type CatKey } from './data.ts';
import { MAX_SLOTS, normPronoun, type Draft, type RollParams, type Slot } from './character.ts';
import { hashStr, mulberry, pick, type Rng } from './rng.ts';
import { ROW2T, TRAITS, TRAITS_BY_CAT, TRAIT_LIST, type AnyRow, type Trait } from './traits.ts';
import { randomInt } from 'node:crypto';

// Бросок, переброс, ручной выбор, доп. слоты — перенос «ROLL», «REROLL / MANUAL PICK», «EXTRA SLOTS».
// Порядок вызовов генератора сохранён: одинаковые параметры и сид дают того же персонажа, что в артефакте.

const AFF_P = 0.3;
const PROF_ARCHS = ['none', 'civilian'];

type CtxLike = Partial<Pick<RollParams, 'arch' | 'profession' | 'professionText' | 'patron' | 'source' | 'universe'>>;

export function mkSlot(t: Trait, p: CtxLike, extra?: Partial<Slot>): Slot {
  const s: Slot = { kind: t.kind, cat: t.cat, traitId: t.id, tier: t.tier };
  if (t.kind === 'class') s.matched = (ARCH_MATCH[p.arch ?? ''] ?? []).includes(t.name);
  return Object.assign(s, extra);
}

function rowTrait(row: AnyRow): Trait {
  const t = ROW2T.get(row);
  if (!t) throw new Error('Строка справочника без черты');
  return t;
}

const profActive = (x: CtxLike | null | undefined) =>
  !!(x && PROF_ARCHS.includes(x.arch ?? '') && Object.prototype.hasOwnProperty.call(PROFESSIONS, x.profession ?? ''));

export interface Craft {
  key: string;
  label: string;
  local: string;
  demand: number;
  edge: string;
  hook: string;
  classes: string[];
}

export function craftOf(x: CtxLike | null | undefined): Craft | null {
  if (!x || !profActive(x)) return null;
  const key = x.profession!;
  const P = PROFESSIONS[key]!;
  if (key === 'other') {
    const t = String(x.professionText ?? '').trim().slice(0, 80);
    return t ? { key: 'other', label: t, local: '', demand: 0, edge: '', hook: '', classes: [] } : null;
  }
  return { key, label: P.label, local: P.local, demand: P.demand, edge: P.edge, hook: P.hook, classes: P.classes.slice() };
}

function affinityFor(p: CtxLike): { kind: 'profession' | 'arch'; list: string[]; label: string } | null {
  const cr = craftOf(p);
  if (cr && cr.classes.length) return { kind: 'profession', list: cr.classes, label: cr.label };
  const a = ARCH_MATCH[p.arch ?? ''] ?? [];
  if (a.length) return { kind: 'arch', list: a, label: ARCHS.find((x) => x[0] === p.arch)?.[1] ?? String(p.arch) };
  return null;
}

function applyAffinity(out: Draft, p: RollParams): Draft {
  const aff = affinityFor(p);
  if (!aff) return out;
  const r = mulberry(hashStr(`${p.seed}:aff`));
  if (r() >= AFF_P) return out;
  const name = pick(r, aff.list);
  const row = CLASSES.find((c) => c[0] === name);
  if (row) out.slots[0] = mkSlot(rowTrait(row), out, { affinity: aff.kind });
  return out;
}

/** Заметка мастеру к классу, подтянутому сродством. */
export function affinityNote(sl: Slot, ctx: CtxLike): string {
  if (!sl.affinity) return '';
  if (sl.affinity === 'profession') {
    const cr = craftOf(ctx);
    return cr ? `Мир опирается на ремесло: ${cr.label}` : '';
  }
  const a = ARCHS.find((x) => x[0] === ctx.arch)?.[1] ?? '';
  return a ? `Мир опирается на прежний путь: ${a}` : '';
}

export function newSeed(): string {
  return String(randomInt(900000) + 100000);
}

export function roll(p: RollParams): Draft {
  const r = mulberry(hashStr(p.seed));
  const out: Draft = {
    seed: p.seed,
    name: p.name,
    pronoun: normPronoun(p.pronoun),
    source: p.source,
    universe: p.universe,
    arch: p.arch,
    patron: p.patron,
    profession: p.profession || '',
    professionText: String(p.professionText || '').slice(0, 80),
    slots: [],
    rerolls: [],
  };
  const cls = pick(r, CLASSES);
  out.slots.push(mkSlot(rowTrait(cls), out));
  const g = pick(r, GREEN);
  out.slots.push(mkSlot(rowTrait(g), out));
  const cats = CATS.slice();
  const chosen: (typeof CATS)[number][] = [];
  for (let i = 0; i < 3; i++) chosen.push(cats.splice(Math.floor(r() * cats.length), 1)[0]!);
  const slots = chosen.map(([key]) => {
    const tier = pick(r, TIER_KEYS);
    let pool = CAT_DATA[key][tier];
    if (key === 'old' && !p.patron) pool = pool.filter((t) => !t[4]);
    return mkSlot(rowTrait(pick(r, pool)), out);
  });
  const sp = SETTING[p.source] ?? [];
  const uv = UNIVERSES[p.universe];
  const up = uv ? uv.traits : [];
  if ((sp.length || up.length) && r() < 0.2) {
    const idx = Math.floor(r() * 3);
    let pool = sp;
    if (up.length && (!sp.length || r() < 0.7)) pool = up;
    const t = pick(r, pool);
    slots[idx] = mkSlot(rowTrait(t), out, { replaced: chosen[idx]![0] });
  }
  out.slots.push(...slots);
  out.rerolls = out.slots.map(() => 0);
  return applyAffinity(out, p);
}

function poolFor(cat: Slot['cat'], tier: string | null, p: CtxLike): Trait[] {
  const all = TRAITS_BY_CAT[cat] ?? [];
  if (cat === 'class' || cat === 'green') return all;
  if (cat === 'setting') {
    const f = all.filter((t) => (t.genre && t.genre === p.source) || (t.universe && t.universe === p.universe));
    return f.length ? f : all;
  }
  return all.filter((t) => t.tier === tier && (cat !== 'old' || p.patron || !t.row[4]));
}

function pickFresh(r: Rng, pool: Trait[], taken: Set<string>): Trait {
  const fresh = pool.filter((t) => !taken.has(t.id));
  return pick(r, fresh.length ? fresh : pool);
}

/** Переброс слота i. Подсид = seed:i:n, n = rerolls[i]+1. Остальные слоты не трогаются. */
export function rerollSlot(draft: Draft, i: number): Draft {
  const old = draft.slots[i];
  if (!old) return draft;
  const n = (draft.rerolls[i] || 0) + 1;
  const r = mulberry(hashStr(`${draft.seed}:${i}:${n}`));
  const taken = new Set(draft.slots.map((s) => s.traitId));
  const tier = old.cat === 'class' || old.cat === 'green' || old.cat === 'setting' ? null : pick(r, TIER_KEYS);
  const t = pickFresh(r, poolFor(old.cat, tier, draft), taken);
  const extra: Partial<Slot> = {};
  if (old.cat === 'setting' && old.replaced) extra.replaced = old.replaced;
  if (old.extra) {
    extra.extra = true;
    extra.random = true;
  }
  const slot = mkSlot(t, draft, extra);
  return {
    ...draft,
    slots: draft.slots.map((s, k) => (k === i ? slot : s)),
    rerolls: draft.slots.map((_, k) => (draft.rerolls[k] || 0) + (k === i ? 1 : 0)),
  };
}

/** Ручной выбор. index = слот на замену, null — добавить доп. слот. */
export function applyPick(draft: Draft, index: number | null, traitId: string): Draft {
  const t = TRAITS[traitId];
  if (!t) return draft;
  const old = index == null ? null : draft.slots[index];
  if (index != null && !old) return draft;
  if (old && (old.cat === 'class' || old.cat === 'green') && t.cat !== old.cat) return draft;
  if (!old && (t.cat === 'class' || t.cat === 'green')) return draft;
  const slot = mkSlot(t, draft, { manual: true });
  if (!old) slot.extra = true;
  else if (old.extra) slot.extra = true;
  const slots = draft.slots.slice();
  const rerolls = draft.slots.map((_, k) => draft.rerolls[k] || 0);
  if (old) slots[index!] = slot;
  else {
    slots.push(slot);
    rerolls.push(0);
  }
  return { ...draft, slots, rerolls };
}

const RANDOM_CATS = CATS.map((c) => c[0]);

function extraCatsLeft(x: Draft): CatKey[] {
  const present = new Set(
    x.slots
      .filter((s, i) => i >= 2 || s.extra)
      .map((s) => (s.cat === 'setting' ? s.replaced : s.cat))
      .filter((c): c is CatKey => RANDOM_CATS.includes(c as CatKey)),
  );
  const left = RANDOM_CATS.filter((c) => !present.has(c));
  return left.length ? left : RANDOM_CATS.slice();
}

/** «+ Случайный трейт»: подсид seed:extra:n, n = extraRolls. */
export function rollExtra(x: Draft): Draft {
  if (!Array.isArray(x.slots) || x.slots.length >= MAX_SLOTS) return x;
  const n = Math.max(0, Math.trunc(Number(x.extraRolls)) || 0);
  const r = mulberry(hashStr(`${x.seed}:extra:${n}`));
  const taken = new Set(x.slots.map((s) => s.traitId));
  const okOld = (t: Trait) => t.cat !== 'old' || x.patron || !t.row[4];
  const cat = pick(r, extraCatsLeft(x));
  const tier = pick(r, TIER_KEYS);
  let pool = (TRAITS_BY_CAT[cat] ?? []).filter((t) => t.tier === tier && okOld(t) && !taken.has(t.id));
  if (!pool.length) pool = (TRAITS_BY_CAT[cat] ?? []).filter((t) => okOld(t) && !taken.has(t.id));
  if (!pool.length) pool = TRAIT_LIST.filter((t) => RANDOM_CATS.includes(t.cat as CatKey) && okOld(t) && !taken.has(t.id));
  if (!pool.length) return x;
  let t = pick(r, pool);
  const extra: Partial<Slot> = { extra: true, random: true };
  const sp = SETTING[x.source] ?? [];
  const uv = UNIVERSES[x.universe];
  const up = uv ? uv.traits : [];
  if ((sp.length || up.length) && r() < 0.2) {
    let pl = sp;
    if (up.length && (!sp.length || r() < 0.7)) pl = up;
    const cand = pl.map((row) => ROW2T.get(row)).filter((c): c is Trait => !!c && !taken.has(c.id));
    if (cand.length) {
      t = pick(r, cand);
      extra.replaced = cat;
    }
  }
  const rer = Array.isArray(x.rerolls) ? x.slots.map((_, k) => x.rerolls[k] || 0) : x.slots.map(() => 0);
  return { ...x, slots: x.slots.concat([mkSlot(t, x, extra)]), rerolls: rer.concat([0]), extraRolls: n + 1 };
}

/** Убрать доп. слот i (базовые не убираются). */
export function removeExtra(x: Draft, i: number): Draft {
  const sl = x.slots[i];
  if (!sl || !sl.extra) return x;
  return { ...x, slots: x.slots.filter((_, k) => k !== i), rerolls: x.rerolls.filter((_, k) => k !== i) };
}
