import type { Effect, RumorKind, SpotKind } from '@zg/shared';
import set from './icons.json';
import { cn } from '../lib/cn.ts';

// Значки game-icons.net (CC BY 3.0, авторы — на экране «Авторы графики»). Набор собирает tools/extract-icons.
export type GameIconName = keyof typeof set.icons;
export const ICON_SET = set;

/** Значок цветом текста (берёт цвета темы). Без label — украшение рядом с подписью, скрыт от экранного диктора. */
export function GameIcon({ name, label, className }: { name: GameIconName; label?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-block size-[1.15em] shrink-0 fill-current align-[-0.2em]', className)}
    >
      <path d={set.icons[name].d} />
    </svg>
  );
}

export const SPOT_ICON: Record<SpotKind, GameIconName> = {
  keep: 'castle',
  tavern: 'tavern-sign',
  market: 'shop',
  smithy: 'anvil',
  temple: 'church',
  guild: 'wax-seal',
  square: 'fountain',
  gate: 'medieval-gate',
  port: 'anchor',
  other: 'position-marker',
};

export const RUMOR_ICON: Record<RumorKind, GameIconName> = { rumor: 'conversation', quest: 'scroll-unfurled' };

export const EFFECT_ICON: Record<Effect, GameIconName> = {
  crit: 'laurel-crown',
  strong: 'sparkles',
  success: 'check-mark',
  complication: 'hazard-sign',
  fail: 'cancel',
  scratch: 'claw-slashes',
  notable_damage: 'bleeding-wound',
  crit_damage: 'skull-crack',
  luck: 'clover',
};
