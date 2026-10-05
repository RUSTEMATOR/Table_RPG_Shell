import { noul, type JsonValue } from '@typesafe-ai/sdk';
import { askJev } from '../client.ts';

// Сводка от Claude → нет ли в ней фактов о персонаже, которых нет в данных
// (новые способности, события биографии, имена родных). Бытовые детали допустимы.

export function splitSentences(text: string): string[] {
  return text
    .replace(/^##.*$/gm, '')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.replace(/^-\s+/, '').trim())
    .filter((s) => s.length > 20)
    .slice(0, 30);
}

export async function runFactCheck(data: unknown, sentences: string[]) {
  const state = { data: JSON.parse(JSON.stringify(data)) as JsonValue, sentences: Object.fromEntries(sentences.map((s, i) => [`s${i}`, s])) };
  const questions = Object.fromEntries(
    sentences.map((_, i) => [
      `invented_s${i}`,
      noul(
        `Сводка о персонаже настольной ролевой игры написана по данным \`data\`. Утверждает ли предложение \`sentences.s${i}\` о персонаже факт, которого в данных нет: новую способность, событие его прошлого, имя родственника или знакомого, или что-то, что противоречит данным?`,
        {
          true: 'Предложение приписывает персонажу способность, событие или связь, которых нет в данных или которые им противоречат.',
          false: 'Предложение опирается на данные или добавляет только бытовые детали, ощущения и обстановку.',
        },
      ),
    ]),
  );
  return askJev({ state, questions });
}
