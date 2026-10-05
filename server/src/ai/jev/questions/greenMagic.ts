import { noul } from '@typesafe-ai/sdk';
import { askJev } from '../client.ts';

// Заявка действия → применяет ли персонаж зелёную магию (подсказка «+1?» мастеру).
// Определение — черновик, Рустем правит его под канон мира.
export const GREEN_MAGIC_DEFINITION =
  'Зелёная магия — магия Зеленогорья, связанная с растениями, ростом, живой природой и жизненной силой. Её применение перегружает мага.';

export interface GreenMagicInput {
  action: string;
  definition?: string;
}

export function greenMagicQuestions(input: GreenMagicInput) {
  return {
    state: { action: input.action, green_magic: input.definition ?? GREEN_MAGIC_DEFINITION },
    questions: {
      uses_green_magic: noul(
        'Персонаж в заявке `action` сам применяет зелёную магию, как она описана в `green_magic`?',
        {
          true: 'Персонаж сам творит зелёную магию или черпает из неё силу.',
          false: 'Персонаж не колдует, применяет другую магию или только говорит о зелёной магии.',
        },
      ),
    },
  };
}

export async function runGreenMagic(input: GreenMagicInput) {
  const { state, questions } = greenMagicQuestions(input);
  return askJev({ state, questions });
}
