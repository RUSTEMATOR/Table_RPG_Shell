import { noul } from '@typesafe-ai/sdk';
import { askJev } from '../client.ts';

// Заявка действия → применяет ли персонаж зелёную магию (подсказка «+1?» мастеру).
// Определение по канону мира (seed/summary-lore.json, seed/green-signs.json). Мастер может уточнить его в песочнице.
export const GREEN_MAGIC_DEFINITION =
  'Зелёная магия Зеленогорья исполняет желания: она даёт чудеса трёх видов — Lesser Miracle, Miracle и Divine Miracle — без ограничений на желание, но с нагрузкой на того, кто колдует. При перегрузке у колдующего зеленеют глаза, затем кожа покрывается изумрудом. Магия на мане, молитвы местным богам, техники и способности из родного мира персонажа зелёной магией не считаются.';

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
          true: 'Персонаж сам загадывает желание зелени, творит чудо или черпает силу из зелёной магии.',
          false: 'Персонаж не колдует, колдует на мане, молится, применяет способность из родного мира или только говорит о зелёной магии.',
        },
      ),
    },
  };
}

export async function runGreenMagic(input: GreenMagicInput) {
  const { state, questions } = greenMagicQuestions(input);
  return askJev({ state, questions });
}
