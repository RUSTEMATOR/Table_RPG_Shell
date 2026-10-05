import { noul, score } from '@typesafe-ai/sdk';
import { askJev } from '../client.ts';
import type { JevTrait } from './types.ts';

// Страж утечек: выдаёт ли текст, который увидит игрок или стол,
// скрытые или намекнутые черты. Только предупреждение мастеру.

const HINT_LEVELS = [
  'Текст никак не связан с этой чертой.',
  'Текст связан с чертой очень отдалённо: догадаться о ней по тексту нельзя.',
  'Текст содержит заметный намёк: внимательный игрок может заподозрить, что у персонажа есть такая черта.',
  'Текст почти раскрывает черту: описывает её действие или эффект, не называя её.',
  'Текст прямо называет черту или пересказывает её суть.',
] as const;

export interface LeakGuardInput {
  text: string;
  hidden: JevTrait[];
  hinted: JevTrait[];
}

export function leakGuardQuestions(input: LeakGuardInput) {
  const traits = Object.fromEntries(
    [...input.hidden, ...input.hinted].map((t) => [t.key, { name: t.name, description: t.description }]),
  );
  const questions: Record<string, ReturnType<typeof noul> | ReturnType<typeof score<typeof HINT_LEVELS>>> = {};
  for (const t of [...input.hidden, ...input.hinted]) {
    questions[`reveals_${t.key}`] = noul(
      `Игрок прочитает текст \`text\`. Выдаёт ли этот текст черту персонажа \`traits.${t.key}\`: называет её, описывает её действие или эффект, или указывает на неё так, что игрок догадается о ней?`,
      {
        true: 'Текст называет черту, пересказывает её действие или эффект, или однозначно на неё указывает.',
        false: 'Текст не связан с чертой или связан так слабо, что догадаться о ней нельзя.',
      },
    );
  }
  for (const t of input.hinted) {
    questions[`hint_${t.key}`] = score(
      `Насколько текст \`text\` раскрывает черту персонажа \`traits.${t.key}\`?`,
      HINT_LEVELS,
    );
  }
  return { state: { text: input.text, traits }, questions };
}

export async function runLeakGuard(input: LeakGuardInput) {
  const { state, questions } = leakGuardQuestions(input);
  return askJev({ state, questions });
}
