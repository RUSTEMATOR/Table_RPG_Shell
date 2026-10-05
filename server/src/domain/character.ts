import type { Tier, TraitCat } from './data.ts';

// Документ персонажа — та же форма, что Char в рандомизаторе (импорт и экспорт без потерь).
// Целиком это мастерские данные: игроку он уходит только через visibility/character.ts.

export interface Revealed {
  trait: boolean;
  /** Сколько ступеней показать игроку (не больше достигнутой). */
  stages: number;
  price: boolean;
  /** Подсказка игроку. Если черта не раскрыта, игрок видит только её. */
  hint: string;
}

export interface HistEntry {
  t: number;
  ev: 'stage' | 'tier' | 'fork' | 'reveal' | 'added';
  from: number | string | null;
  to: number | string | null;
  reason?: string;
}

export interface Slot {
  kind: 'class' | 'green' | 'mark' | 'trait';
  cat: TraitCat;
  traitId: string;
  tier: Tier;
  matched?: boolean;
  replaced?: string;
  manual?: boolean;
  extra?: boolean;
  random?: boolean;
  affinity?: 'profession' | 'arch';
  stage?: number;
  fork?: 'a' | 'b' | null;
  history?: HistEntry[];
  revealed?: Revealed;
}

export interface RollParams {
  seed: string;
  name: string;
  pronoun: string;
  source: string;
  universe: string;
  arch: string;
  patron: boolean;
  profession: string;
  professionText: string;
}

export interface Draft extends RollParams {
  slots: Slot[];
  rerolls: number[];
  extraRolls?: number;
}

export interface Power {
  value: number;
  history: { t: number; from: number; to: number; note: string }[];
}

export interface PersonalEntry {
  signs: string;
  reveals: string[];
  hooks: string[];
}

export interface SummaryEntry {
  text?: string;
  at?: number;
  sig?: number;
  edited?: boolean;
  show?: boolean;
  tone?: string;
  person?: string;
  model?: string;
}

export interface CharDoc {
  id: string;
  name: string;
  source: string;
  universe: string;
  arch: string;
  patron: boolean;
  seed: string;
  createdAt: number;
  updatedAt: number;
  /** Заметки мастера. */
  notes: string;
  slots: Slot[];
  revealedAt: number | null;
  pronoun?: string;
  extraRolls?: number;
  rerolls?: number[];
  power?: Power;
  showPower?: boolean;
  profession?: string;
  professionText?: string;
  summary?: { gm?: SummaryEntry; player?: SummaryEntry; crossing?: SummaryEntry };
  personal?: { at: number; tier?: string; slots: Record<string, PersonalEntry> };
  showPortrait?: boolean;
  cardTheme?: string;
  image?: { dataUri: string; w: number; h: number };
}

export const STAGE_NAMES = ['Спит', 'Пробуждение', 'Освоение', 'Мастерство', 'Предел'] as const;
export const STEP_NAMES = STAGE_NAMES.slice(1);
export const HIST_MAX = 100;
export const BASE_SLOTS = 5;
export const MAX_SLOTS = 10;

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const int04 = (n: unknown) => clamp(Math.trunc(Number(n)) || 0, 0, 4);

export const normPronoun = (v: unknown): string => (v === 'он' || v === 'она' || v === 'они' ? v : '');
export const pronounWord = (v: unknown): string => normPronoun(v) || 'не указано';

export function normRevealed(r: unknown): Revealed {
  const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
  return { trait: !!o.trait, stages: int04(o.stages), price: !!o.price, hint: typeof o.hint === 'string' ? o.hint : '' };
}
