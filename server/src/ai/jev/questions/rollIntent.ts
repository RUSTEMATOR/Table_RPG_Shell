import { choice, type Questions } from '@typesafe-ai/sdk';
import { askJev } from '../client.ts';
import type { JevTrait } from './types.ts';

// Заявка действия → какой бросок и какая раскрытая черта.
// Только подсказка мастеру; числа силы и потолок эффекта считает код.

const ROLL_KINDS = {
  skill_check:
    'Действие с риском неудачи, исход которого зависит от умений, силы или способностей персонажа. Нужна проверка d10.',
  luck: 'Исход зависит от случая или везения, а не от умений персонажа. Нужен бросок удачи d20.',
  no_roll: 'Действие простое, безопасное или чисто разговорное, бросок не нужен.',
  unclear: 'По заявке нельзя понять, что именно персонаж пытается сделать.',
} as const;

export interface RollIntentInput {
  action: string;
  revealed: JevTrait[];
}

export function rollIntentQuestions(input: RollIntentInput) {
  const traitOptions: Record<string, { name: string; description: string } | string> = Object.fromEntries(
    input.revealed.map((t) => [t.key, { name: t.name, description: t.description }]),
  );
  traitOptions.none = 'Ни одна из черт персонажа не помогает и не мешает в этом действии.';
  const rollKind = choice(`Игрок НРИ заявил действие своего персонажа: \`action\`. Какой бросок нужен?`, ROLL_KINDS);
  const trait = choice(
    `Игрок НРИ заявил действие своего персонажа: \`action\`. Какая черта персонажа сильнее всего влияет на это действие?`,
    traitOptions,
  );
  // Без раскрытых черт выбирать не из чего: спрашиваем только про бросок.
  const questions: Questions = input.revealed.length > 0 ? { roll_kind: rollKind, trait } : { roll_kind: rollKind };
  return { state: { action: input.action }, questions };
}

export async function runRollIntent(input: RollIntentInput) {
  const { state, questions } = rollIntentQuestions(input);
  return askJev({ state, questions });
}
