import { score } from '@typesafe-ai/sdk';
import { askJev } from '../client.ts';
import type { JevTrait } from './types.ts';

// Дневник игрока → какую скрытую черту он, похоже, нащупал.
// Записи «только для меня» сюда не попадают никогда.

const MATCH_LEVELS = [
  'Запись никак не касается того, что делает эта черта.',
  'Запись касается похожей темы, но проявления черты в ней не видно.',
  'Запись описывает событие или ощущение, которое могло быть проявлением этой черты.',
  'Запись явно описывает проявление этой черты, хотя игрок может не знать её названия.',
] as const;

export interface DiaryMatchInput {
  entry: string;
  hidden: JevTrait[];
}

export function diaryMatchQuestions(input: DiaryMatchInput) {
  const traits = Object.fromEntries(input.hidden.map((t) => [t.key, { name: t.name, description: t.description }]));
  const questions = Object.fromEntries(
    input.hidden.map((t) => [
      `match_${t.key}`,
      score(
        `Игрок записал в дневник персонажа запись \`entry\`. Описывает ли она проявление черты \`traits.${t.key}\`, о которой игрок пока не знает?`,
        MATCH_LEVELS,
      ),
    ]),
  );
  return { state: { entry: input.entry, traits }, questions };
}

export async function runDiaryMatch(input: DiaryMatchInput) {
  const { state, questions } = diaryMatchQuestions(input);
  return askJev({ state, questions });
}
