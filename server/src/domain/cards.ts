import { CARDS, COMBOS, SOURCES, TIERS, TIER_KEYS, UNIVERSES, type Tier } from './data.ts';
import {
  HIST_MAX,
  STEP_NAMES,
  clamp,
  int04,
  normRevealed,
  type CharDoc,
  type HistEntry,
  type PersonalEntry,
  type Slot,
} from './character.ts';
import { CAT_LABELS, TRAITS } from './traits.ts';

// Карточки черт, ступени, раскрытие, уровень силы — перенос «TRAIT CARDS, STAGES, REVEAL» и «POWER LEVEL».

const str = (x: unknown) => (x == null ? '' : String(x));
export const dot = (s: unknown) => {
  const t = String(s ?? '').trim();
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`;
};
export const normQ = (s: unknown) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');

export interface Step {
  name: string;
  can: string;
  cost: string;
  trigger: string;
}
export interface ForkOpt {
  title: string;
  text: string;
  cost: string;
}
export interface Card {
  name: string;
  d: string;
  steps: Step[];
  fork: { a: ForkOpt; b: ForkOpt } | null;
  tierShift: Record<string, string> | null;
  /** Только у меток; мастерское, игроку — лишь при revealed.price. */
  price?: string;
  /** Только мастеру, игроку никогда. */
  hook?: string;
}

export function catLabel(s: Slot): string {
  const t = TRAITS[s.traitId];
  return s.cat === 'setting' && t?.src ? `${CAT_LABELS.setting} (${t.src})` : (CAT_LABELS[s.cat] ?? s.cat);
}

/** Единственный адаптер «строка данных + CARDS → карточка». Мастерских слоёв не возвращает (см. gmLayers). */
export function cardOf(slot: Slot | null | undefined): Card {
  const t = TRAITS[slot?.traitId ?? ''];
  const steps: Step[] = STEP_NAMES.map((name) => ({ name, can: '', cost: '', trigger: '' }));
  const card: Card = { name: String(slot?.traitId ?? ''), d: '', steps, fork: null, tierShift: null };
  if (!t) return card;
  const r = t.row as unknown[];
  const cc = CARDS[t.id];
  card.name = t.name;
  if (t.cat === 'class' || t.cat === 'green') card.d = String(r[1]);
  else if (t.cat === 'mark') {
    card.d = String(r[1]);
    card.price = String(r[3]);
    card.hook = String(r[4]);
  } else card.d = String(t.cat === 'setting' ? r[2] : r[1]);
  if (cc && Array.isArray(cc.steps)) {
    cc.steps.slice(0, 4).forEach((x, i) => {
      steps[i]!.can = str(x?.can);
      steps[i]!.cost = str(x?.cost);
      steps[i]!.trigger = str(x?.trigger);
    });
    const f = cc.fork;
    const opt = (o: { title?: string; text?: string; cost?: string } | undefined): ForkOpt => ({
      title: str(o?.title),
      text: str(o?.text),
      cost: str(o?.cost),
    });
    if (f?.a && f?.b) card.fork = { a: opt(f.a), b: opt(f.b) };
    if (cc.tierShift && typeof cc.tierShift === 'object') card.tierShift = { ...cc.tierShift };
  } else if (t.cat === 'mark') {
    (r[2] as string[]).forEach((x, i) => {
      steps[i]!.can = String(x);
    });
  } else if (t.cat !== 'class' && t.cat !== 'green') {
    (r[3] as string[]).forEach((x, i) => {
      if (steps[i]) steps[i]!.can = String(x);
    });
    steps[3]!.can = 'ещё не описан';
  }
  return card;
}

/** Ступени для этого слота: выбранная развилка заменяет четвёртую. */
export function effSteps(card: Card, slot: Slot): Step[] {
  const s = card.steps.map((x) => ({ ...x }));
  const f = slot.fork && card.fork ? card.fork[slot.fork] : null;
  if (f) s[3] = { name: String(f.title || STEP_NAMES[3]), can: String(f.text || ''), cost: String(f.cost || ''), trigger: '' };
  return s;
}

export const stepText = (s: Step) => s.name + (s.can ? `: ${s.can}` : '') + (s.cost ? ` (цена: ${s.cost})` : '');

export function nextTrigger(slot: Slot): { label: string; text: string } | null {
  const st = int04(slot.stage);
  if (st > 3) return null;
  const tr = cardOf(slot).steps[st]!.trigger;
  return tr ? { label: st === 3 ? 'Условие предела' : 'Триггер следующей ступени', text: tr } : null;
}

function hookRepeats(h: string, list: string[]): boolean {
  const w = normQ(h)
    .split(/[^a-zа-я0-9]+/)
    .filter((x) => x.length > 3);
  return (
    !w.length ||
    list.some((x) => {
      const n = normQ(x);
      return w.filter((v) => n.includes(v.slice(0, Math.max(4, v.length - 2)))).length / w.length >= 0.6;
    })
  );
}

export function normPersonalEntry(v: unknown): PersonalEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
  const arr = (a: unknown) =>
    (Array.isArray(a) ? a : [])
      .map(s)
      .filter(Boolean)
      .slice(0, 3)
      .map((x) => x.slice(0, 500));
  const e = { signs: s(o.signs).slice(0, 600), reveals: arr(o.reveals), hooks: arr(o.hooks) };
  return e.signs || e.reveals.length || e.hooks.length ? e : null;
}

export function personalOf(x: Pick<CharDoc, 'personal'> | null | undefined, traitId: string): PersonalEntry | null {
  const p = x?.personal?.slots;
  return p && p[traitId] ? normPersonalEntry(p[traitId]) : null;
}

export interface GmLayers {
  truth: string;
  signs: string;
  reveals: string[];
  hooks: string[];
  ifEarly: string;
  ifIgnored: string;
  combos: string[];
  overload: string;
  flavor: string;
  flavorSrc: string;
  tierShift: string;
  tierLabel: string;
  trigger: string;
  triggerLabel: string;
  personal?: boolean;
}

/** Мастерские слои карточки. Только для экрана мастера; visibility для игрока их не читает. */
export function gmLayers(slot: Slot, ctx: Partial<CharDoc> | null): GmLayers | null {
  const t = TRAITS[slot.traitId];
  const c = t ? CARDS[t.id] : undefined;
  if (!t || !c) return null;
  const nm = (id: string) => TRAITS[id]?.name ?? id;
  const L: GmLayers = {
    truth: str(c.truth),
    signs: str(c.signs),
    reveals: (c.reveals ?? []).map(str),
    hooks: (c.hooks ?? []).map(str),
    ifEarly: str(c.ifEarly),
    ifIgnored: str(c.ifIgnored),
    combos: (c.combos ?? []).map(nm),
    overload: str(c.overload),
    flavor: '',
    flavorSrc: '',
    tierShift: '',
    tierLabel: '',
    trigger: '',
    triggerLabel: '',
  };
  const nt = nextTrigger(slot);
  if (nt) {
    L.trigger = nt.text;
    L.triggerLabel = nt.label;
  }
  const pv = personalOf(ctx, t.id);
  if (pv) {
    if (pv.signs) L.signs = pv.signs;
    if (pv.reveals.length) L.reveals = pv.reveals.slice();
    if (pv.hooks.length) L.hooks = pv.hooks.slice();
    L.personal = true;
  }
  const row = t.row as unknown[];
  if (!pv && t.cat === 'mark' && row[4] && !hookRepeats(String(row[4]), L.hooks)) L.hooks.push(String(row[4]));
  const src = ctx?.source;
  if (src && c.flavors && c.flavors[src]) {
    L.flavor = str(c.flavors[src]);
    L.flavorSrc = SOURCES.find((x) => x[0] === src)?.[1] ?? String(src);
  }
  if (c.tierShift && slot.tier && c.tierShift[slot.tier]) {
    L.tierShift = str(c.tierShift[slot.tier]);
    L.tierLabel = TIERS[slot.tier as keyof typeof TIERS] ?? String(slot.tier);
  }
  return L.truth || L.signs || L.overload || L.reveals.length || L.hooks.length || L.ifEarly || L.ifIgnored || L.combos.length || L.flavor || L.tierShift || L.trigger
    ? L
    : null;
}

export function combosFor(char: Pick<CharDoc, 'slots'>): { a: string; b: string; text: string; names: [string, string] }[] {
  const ids = new Set(char.slots.map((s) => s.traitId));
  const nm = (id: string) => TRAITS[id]?.name ?? id;
  return COMBOS.filter((c) => c.a !== c.b && ids.has(c.a) && ids.has(c.b)).map((c) => ({
    a: c.a,
    b: c.b,
    text: c.text,
    names: [nm(c.a), nm(c.b)],
  }));
}

function pushHist(sl: Slot, e: Omit<HistEntry, 't'>, now: number) {
  sl.history = (Array.isArray(sl.history) ? sl.history : []).concat([{ t: now, ...e }]).slice(-HIST_MAX);
}

/** Мутаторы слота: возвращают false, если ничего не изменилось. */
export function setStage(sl: Slot, toRaw: number, now = Date.now()): boolean {
  const from = int04(sl.stage);
  const to = int04(toRaw);
  if (to === from) return false;
  sl.stage = to;
  pushHist(sl, { ev: 'stage', from, to }, now);
  sl.revealed = normRevealed(sl.revealed);
  if (sl.revealed.stages > to) sl.revealed.stages = to;
  return true;
}

export function setTier(sl: Slot, to: string, reason: string, now = Date.now()): boolean {
  if (!((TIER_KEYS as readonly string[]).includes(to) || to === 'fixed') || to === sl.tier) return false;
  const from = sl.tier;
  sl.tier = to as Tier;
  pushHist(sl, { ev: 'tier', from, to, reason: String(reason || '').trim().slice(0, 200) }, now);
  return true;
}

export function setFork(sl: Slot, card: Card, f: 'a' | 'b' | null, now = Date.now()): boolean {
  if (!card.fork || int04(sl.stage) !== 4 || !(f === 'a' || f === 'b') || !card.fork[f] || sl.fork === f) return false;
  const from = sl.fork ?? null;
  sl.fork = f;
  pushHist(sl, { ev: 'fork', from, to: f }, now);
  return true;
}

/** Раскрытие: что видит игрок. Ступеней не больше достигнутой. */
export function setReveal(sl: Slot, patch: Partial<{ trait: boolean; stages: number; price: boolean; hint: string }>, now = Date.now()): boolean {
  const before = normRevealed(sl.revealed);
  const next = normRevealed({ ...before, ...patch });
  next.hint = next.hint.slice(0, 300);
  if (next.stages > int04(sl.stage)) next.stages = int04(sl.stage);
  if (JSON.stringify(before) === JSON.stringify(next)) return false;
  sl.revealed = next;
  const lvl = (r: typeof next) => (r.trait ? 'revealed' : r.hint.trim() ? 'hinted' : 'hidden');
  if (lvl(before) !== lvl(next)) pushHist(sl, { ev: 'reveal', from: lvl(before), to: lvl(next) }, now);
  return true;
}

// ---- Уровень силы ----

export const POWER_DEFAULT = 10;
export const POWER_MAX = 99999;
export const POWER_BANDS = [
  { min: 1, max: 50, name: 'Обычный', subs: [[1, 15, 'расходник'], [16, 35, 'солдат'], [36, 50, 'профессионал']] as [number, number, string][] },
  { min: 51, max: 100, name: 'Героический' },
  { min: 101, max: 300, name: 'Монструозный' },
  { min: 301, max: 600, name: 'Легендарный' },
  { min: 601, max: 1000, name: 'Полубог/демонический' },
  { min: 1001, max: Infinity, name: 'Божественный' },
] as const;

export const powerClamp = (v: unknown) => clamp(Math.round(Number(v)) || POWER_DEFAULT, 1, POWER_MAX);
export const powerOf = (x: Pick<CharDoc, 'power'> | null | undefined) =>
  x?.power && Number(x.power.value) > 0 ? powerClamp(x.power.value) : POWER_DEFAULT;

export function powerBand(v: number): { i: number; name: string; sub: string; label: string } {
  const val = powerClamp(v);
  const i = POWER_BANDS.findIndex((b) => val >= b.min && val <= b.max);
  const b = POWER_BANDS[i]!;
  const sub = 'subs' in b ? (b.subs.find((s) => val >= s[0] && val <= s[1])?.[2] ?? '') : '';
  return { i, name: b.name, sub, label: b.name + (sub ? ` · ${sub}` : '') };
}

/** Рекомендуемый уровень для ступени: Освоение 50, Мастерство 100, Предел 300. */
export const STAGE_POWER = [0, 0, 50, 100, 300];
export function stagePowerHint(power: number, nextStage: number): string {
  const thr = STAGE_POWER[nextStage];
  return thr && powerClamp(power) < thr ? `Рекомендуемый уровень силы: от ${thr}` : '';
}

export function originOf(x: Pick<CharDoc, 'source' | 'universe'>): string {
  const s = SOURCES.find((v) => v[0] === x.source)?.[1] ?? '';
  const u = UNIVERSES[x.universe];
  return [s, u ? u.name : ''].filter(Boolean).join(' · ');
}
