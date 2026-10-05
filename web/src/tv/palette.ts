import type { CSSProperties } from 'react';
import type { FeedRoll } from '../lib/feed.ts';

/** Палитра стола (макет «Стол · бросок»). Не зависит от тем игроков и «Дня/Ночи»: экран смотрят издалека, в тёмной комнате. */
export const TV_VARS = {
  '--tv-bg': '#0d0f0d',
  '--tv-ink': '#f5f7f2',
  '--tv-soft': '#dfe6dc',
  '--tv-muted': '#c2cbbf',
  '--tv-line': '#3a463c',
  '--tv-card': '#161a16',
  '--tv-accent': '#6fe0a6',
  '--tv-ok': '#8ef0b0',
  '--tv-bad': '#ff8b8b',
  '--tv-warn': '#f0c46f',
} as CSSProperties;

const OK = new Set(['crit', 'crit_damage', 'strong', 'success', 'luck']);
const BAD = new Set(['complication', 'notable_damage', 'fail']);

/** Цвет исхода на столе. */
export const effectColor = (e: string) =>
  e === 'scratch' ? 'text-[var(--tv-warn)]' : OK.has(e) ? 'text-[var(--tv-ok)]' : BAD.has(e) ? 'text-[var(--tv-bad)]' : 'text-[var(--tv-muted)]';

/** Что попадает на стол: только публичные броски (у стола и так только публичная аудитория — это второй замок). */
export const isTableRoll = (r: FeedRoll) => !('memberId' in r) && !r.private;
