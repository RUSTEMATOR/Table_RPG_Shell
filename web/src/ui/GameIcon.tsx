import type { ReactNode } from 'react';
import type { Effect, MomentKind, RumorKind, SpotKind } from '@zg/shared';
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

/** Памятные моменты (этап 47). */
export const MOMENT_ICON: Record<MomentKind, GameIconName> = {
  crit: 'laurel-crown',
  fumble: 'skull-crack',
  savior: 'anchor',
  bravery: 'claw-slashes',
  wit: 'conversation',
  luck: 'clover',
  sacrifice: 'bleeding-wound',
  discovery: 'position-marker',
  custom: 'wax-seal',
};

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

/** Пустое состояние: крупный бледный значок и подпись. */
export function EmptyState({ icon, children }: { icon: GameIconName; children: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 py-5 text-center text-muted">
      <GameIcon name={icon} className="size-11 opacity-50" />
      <p className="m-0 max-w-[32ch]">{children}</p>
    </div>
  );
}
