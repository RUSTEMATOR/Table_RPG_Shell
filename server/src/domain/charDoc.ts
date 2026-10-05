import { ARCHS, PROFESSIONS, SOURCES, TIER_KEYS, UNIVERSES } from './data.ts';
import { normPersonalEntry } from './cards.ts';
import {
  HIST_MAX,
  MAX_SLOTS,
  int04,
  normPronoun,
  normRevealed,
  type CharDoc,
  type Draft,
  type HistEntry,
  type Power,
  type Slot,
} from './character.ts';
import { powerClamp, powerOf } from './cards.ts';
import { TRAITS } from './traits.ts';

// Сохранение черновика и импорт JSON из артефакта (перенос importChar §7.2):
// форма проверяется, kind/cat берутся из справочника, а не из файла.

export function draftToChar(draft: Draft, id: string, now = Date.now()): CharDoc {
  const c: CharDoc = {
    id,
    name: String(draft.name || '').slice(0, 120),
    source: SOURCES.some((x) => x[0] === draft.source) ? draft.source : 'other',
    universe: UNIVERSES[draft.universe] ? draft.universe : '',
    arch: ARCHS.some((x) => x[0] === draft.arch) ? draft.arch : 'none',
    patron: !!draft.patron,
    seed: String(draft.seed).slice(0, 64),
    createdAt: now,
    updatedAt: now,
    notes: '',
    slots: draft.slots.map((s) => ({
      ...s,
      stage: 0,
      fork: null,
      history: [{ t: now, ev: 'added' as const, from: null, to: s.traitId }],
      revealed: normRevealed(null),
    })),
    revealedAt: null,
    rerolls: draft.rerolls.slice(),
  };
  if (normPronoun(draft.pronoun)) c.pronoun = normPronoun(draft.pronoun);
  if (draft.extraRolls) c.extraRolls = draft.extraRolls;
  if (Object.prototype.hasOwnProperty.call(PROFESSIONS, draft.profession)) c.profession = draft.profession;
  if (draft.professionText) c.professionText = draft.professionText.slice(0, 80);
  return c;
}

function normPower(p: unknown): Power {
  const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
  const out: Power = { value: powerOf({ power: { value: Number(o.value), history: [] } }), history: [] };
  if (Array.isArray(o.history))
    out.history = o.history
      .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
      .slice(-HIST_MAX)
      .map((h) => ({ t: Number(h.t) || 0, from: powerClamp(h.from), to: powerClamp(h.to), note: String(h.note ?? '').slice(0, 200) }));
  return out;
}

function normSummary(v: unknown): CharDoc['summary'] | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: NonNullable<CharDoc['summary']> = {};
  for (const k of ['gm', 'player', 'crossing'] as const) {
    const e = o[k];
    if (!e || typeof e !== 'object') continue;
    const x = e as Record<string, unknown>;
    out[k] = {
      text: typeof x.text === 'string' ? x.text.slice(0, 20000) : '',
      at: Number(x.at) || 0,
      ...(typeof x.sig === 'number' ? { sig: x.sig } : {}),
      edited: !!x.edited,
      show: x.show === true,
      ...(typeof x.tone === 'string' ? { tone: x.tone } : {}),
      ...(typeof x.person === 'string' ? { person: x.person } : {}),
    };
  }
  return Object.keys(out).length ? out : undefined;
}

export class ImportError extends Error {}

export function importChar(obj: unknown, id: string, now = Date.now()): CharDoc {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new ImportError('Файл не похож на персонажа');
  const o = obj as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) throw new ImportError('Файл не похож на персонажа: нет id');
  if (!Array.isArray(o.slots) || !o.slots.length || o.slots.length > MAX_SLOTS) throw new ImportError('Файл не похож на персонажа: нет слотов');
  const slots: Slot[] = o.slots.map((raw: unknown) => {
    const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const t = typeof s.traitId === 'string' ? TRAITS[s.traitId] : undefined;
    if (!t) throw new ImportError(`Неизвестный трейт: ${String(s.traitId).slice(0, 60)}`);
    const hist: HistEntry[] = (Array.isArray(s.history) ? s.history : [])
      .filter((h: unknown): h is Record<string, unknown> => !!h && typeof h === 'object' && ['stage', 'tier', 'fork', 'reveal', 'added'].includes(String((h as Record<string, unknown>).ev)))
      .slice(-HIST_MAX)
      .map((h) => {
        const e: HistEntry = {
          t: Number(h.t) || 0,
          ev: h.ev as HistEntry['ev'],
          from: h.from == null ? null : typeof h.from === 'number' ? h.from : String(h.from),
          to: h.to == null ? null : typeof h.to === 'number' ? h.to : String(h.to),
        };
        if (typeof h.reason === 'string') e.reason = h.reason.slice(0, 200);
        return e;
      });
    const tier = (TIER_KEYS as readonly string[]).includes(String(s.tier)) || s.tier === 'fixed' ? (s.tier as Slot['tier']) : t.tier;
    const r: Slot = {
      kind: t.kind,
      cat: t.cat,
      traitId: t.id,
      tier,
      stage: int04(s.stage),
      fork: s.fork === 'a' || s.fork === 'b' ? s.fork : null,
      history: hist,
      revealed: normRevealed(s.revealed),
    };
    if (r.revealed!.stages > r.stage!) r.revealed!.stages = r.stage!;
    if (s.matched) r.matched = true;
    if (typeof s.replaced === 'string' && s.replaced) r.replaced = s.replaced.slice(0, 40);
    if (s.manual) r.manual = true;
    if (s.extra) r.extra = true;
    if (s.affinity === 'profession' || s.affinity === 'arch') r.affinity = s.affinity;
    if (s.random) r.random = true;
    return r;
  });
  const c: CharDoc = {
    id,
    name: String(o.name ?? '').slice(0, 120),
    source: SOURCES.some((x) => x[0] === o.source) ? String(o.source) : 'other',
    universe: typeof o.universe === 'string' && UNIVERSES[o.universe] ? o.universe : '',
    arch: ARCHS.some((x) => x[0] === o.arch) ? String(o.arch) : 'none',
    patron: !!o.patron,
    seed: String(o.seed ?? '').slice(0, 64),
    createdAt: Number(o.createdAt) || now,
    updatedAt: now,
    notes: String(o.notes ?? '').slice(0, 20000),
    slots,
    revealedAt: null,
  };
  if (o.showPortrait === false) c.showPortrait = false;
  if (typeof o.cardTheme === 'string') c.cardTheme = o.cardTheme.slice(0, 40);
  if (normPronoun(o.pronoun)) c.pronoun = normPronoun(o.pronoun);
  if (Number(o.extraRolls) > 0) c.extraRolls = Math.trunc(Number(o.extraRolls));
  if (o.power) c.power = normPower(o.power);
  if (o.showPower === true) c.showPower = true;
  if (typeof o.profession === 'string' && Object.prototype.hasOwnProperty.call(PROFESSIONS, o.profession)) c.profession = o.profession;
  const sm = normSummary(o.summary);
  if (sm) c.summary = sm;
  const pe = o.personal as Record<string, unknown> | undefined;
  if (pe && typeof pe === 'object' && pe.slots && typeof pe.slots === 'object') {
    const ps: Record<string, NonNullable<ReturnType<typeof normPersonalEntry>>> = {};
    for (const [k, e] of Object.entries(pe.slots as Record<string, unknown>)) {
      if (!TRAITS[k]) continue;
      const n = normPersonalEntry(e);
      if (n) ps[k] = n;
    }
    if (Object.keys(ps).length) c.personal = { at: Number(pe.at) || 0, slots: ps, ...(['complex', 'default', 'quick'].includes(String(pe.tier)) ? { tier: String(pe.tier) } : {}) };
  }
  if (typeof o.professionText === 'string' && o.professionText) c.professionText = o.professionText.slice(0, 80);
  const im = o.image as Record<string, unknown> | undefined;
  if (im && typeof im.dataUri === 'string' && im.dataUri.length <= 250000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(im.dataUri))
    c.image = { dataUri: im.dataUri, w: Number(im.w) || 0, h: Number(im.h) || 0 };
  return c;
}

/** Документ из базы: доверяем своему JSON, но слоты без черты из справочника отбрасываются при показе. */
export function parseDoc(json: string): CharDoc {
  return JSON.parse(json) as CharDoc;
}
