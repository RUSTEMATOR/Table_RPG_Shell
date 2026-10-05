import { randomInt } from 'node:crypto';
import type { Effect } from '@zg/shared';
import { powerBand } from './cards.ts';

// Броски. Случайность — только crypto.randomInt на сервере.
// Таблица d10 — стартовое предложение плана; правило разницы сил — канон рандомизатора (powerCompare):
// сравниваются ступени силы, а не отношение чисел.

export function d10Outcome(v: number): Effect {
  if (v <= 1) return 'complication';
  if (v <= 5) return 'fail';
  if (v <= 8) return 'success';
  if (v === 9) return 'strong';
  return 'crit';
}

const SUCCESS: Effect[] = ['success', 'strong', 'crit'];

export interface RollResult {
  value: number;
  outcome: Effect;
  effect: Effect;
  ruleText: string;
}

export function rollDie(kind: 'd10' | 'd20'): number {
  return randomInt(1, kind === 'd10' ? 11 : 21);
}

/** Поправка на разницу ступеней силы. enemy = null — противника нет, обычный бросок. */
export function applyPowerRule(outcome: Effect, me: number, enemy: number | null): { effect: Effect; ruleText: string } {
  if (enemy === null) return { effect: outcome, ruleText: 'Противник не задан: обычный бросок.' };
  const a = powerBand(me);
  const b = powerBand(enemy);
  const gap = b.i - a.i;
  if (gap >= 2) {
    return {
      effect: SUCCESS.includes(outcome) ? 'scratch' : outcome,
      ruleText: `Противник на ${gap} ступени выше (${a.name} против ${b.name}): даже критический успех лишь царапает.`,
    };
  }
  if (gap <= -2) {
    return {
      effect: SUCCESS.includes(outcome) ? 'crit_damage' : 'notable_damage',
      ruleText: `Противник на ${-gap} ступени ниже (${a.name} против ${b.name}): критический урон без крита; даже провал наносит заметный урон, но не убивает с одного удара, если цель хотя бы Обычная.`,
    };
  }
  return { effect: outcome, ruleText: `${a.name} против ${b.name}: обычный бросок.` };
}

export function resolveRoll(kind: 'd10' | 'd20', me: number, enemy: number | null, value = rollDie(kind)): RollResult {
  if (kind === 'd20') return { value, outcome: 'luck', effect: 'luck', ruleText: 'Бросок удачи: сила не учитывается.' };
  const outcome = d10Outcome(value);
  return { value, outcome, ...applyPowerRule(outcome, me, enemy) };
}
