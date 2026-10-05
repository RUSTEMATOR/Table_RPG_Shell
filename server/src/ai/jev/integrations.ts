import type { DiarySuggestion, HintCheck } from '@zg/shared';
import { cardOf } from '../../domain/cards.ts';
import { normRevealed, type CharDoc } from '../../domain/character.ts';
import type { DiaryRow } from '../../domain/diary.ts';
import { diaryForGm, getDiary } from '../../domain/diary.ts';
import { loadCharacter } from '../../domain/repo.ts';
import type { RollRow } from '../../domain/rollService.ts';
import { publish } from '../../realtime/publish.ts';
import { log } from '../../realtime/log.ts';
import { jevFeatures } from './client.ts';
import { isDemoRoom } from '../../domain/demo.ts';
import { saveJudgment } from './judgments.ts';
import { runDiaryMatch } from './questions/diaryMatch.ts';
import { runGreenMagic } from './questions/greenMagic.ts';
import { runLeakGuard } from './questions/leakGuard.ts';
import { runFactCheck, splitSentences } from './questions/factCheck.ts';
import type { JevTrait } from './questions/types.ts';
import { DIARY_MATCH_MIN, FACT_WARN, GREEN_MIN, HINT_SELF_WARN, LEAK_WARN } from './thresholds.ts';

// Jev в игре. Всё только советует мастеру; ответы — мастерские данные.

const asTrait = (doc: CharDoc, i: number): JevTrait => {
  const card = cardOf(doc.slots[i]);
  return { key: `t${i}`, name: card.name, description: card.d };
};

/** Подсказку к черте slot проверяем до сохранения: не выдаёт ли она свою черту слишком явно и не задевает ли чужие. */
export async function checkHint(roomId: string, characterId: string, slot: number, hint: string): Promise<HintCheck> {
  if (!jevFeatures.leakGuard() || isDemoRoom(roomId)) return { status: 'off', selfScore: null, others: [] };
  const lc = loadCharacter(roomId, characterId);
  if (!lc || !lc.doc.slots[slot] || !hint.trim()) return { status: 'ok', selfScore: null, others: [] };
  const others = lc.doc.slots.map((s, i) => ({ s, i })).filter(({ s, i }) => i !== slot && !normRevealed(s.revealed).trait);
  const self = asTrait(lc.doc, slot);
  const res = await runLeakGuard({ text: hint, hidden: others.map(({ i }) => asTrait(lc.doc, i)), hinted: [self] });
  if (!res.ok) return { status: 'unavailable', selfScore: null, others: [] };
  saveJudgment(roomId, 'leakGuard.hint', `${characterId}:${slot}`, res.result.model, res.result.answers);
  const answers = res.result.answers as Record<string, { noul?: number; score?: number }>;
  const selfScore = answers[`hint_${self.key}`]?.score ?? null;
  const flagged = others
    .map(({ i }) => ({ traitName: cardOf(lc.doc.slots[i]).name, probability: answers[`reveals_t${i}`]?.noul ?? 0 }))
    .filter((o) => o.probability >= LEAK_WARN);
  const warn = flagged.length > 0 || (selfScore !== null && selfScore >= HINT_SELF_WARN);
  return { status: warn ? 'warn' : 'ok', selfScore, others: flagged };
}

/** Проверка текста для стола или игрока по всем скрытым и намекнутым чертам персонажей комнаты (этап 5). */
export async function checkPublicText(
  roomId: string,
  text: string,
  docs: CharDoc[],
): Promise<{ status: HintCheck['status']; others: HintCheck['others'] }> {
  if (!jevFeatures.leakGuard() || isDemoRoom(roomId)) return { status: 'off', others: [] };
  const traits: { key: string; name: string; description: string }[] = [];
  docs.forEach((doc, d) =>
    doc.slots.forEach((s, i) => {
      if (normRevealed(s.revealed).trait) return;
      const card = cardOf(s);
      traits.push({ key: `c${d}t${i}`, name: card.name, description: card.d });
    }),
  );
  if (!traits.length || !text.trim()) return { status: 'ok', others: [] };
  const res = await runLeakGuard({ text, hidden: traits.slice(0, 40), hinted: [] });
  if (!res.ok) return { status: 'unavailable', others: [] };
  saveJudgment(roomId, 'leakGuard.text', 'scene', res.result.model, res.result.answers);
  const answers = res.result.answers as Record<string, { noul?: number }>;
  const others = traits
    .map((t) => ({ traitName: t.name, probability: answers[`reveals_${t.key}`]?.noul ?? 0 }))
    .filter((o) => o.probability >= LEAK_WARN);
  return { status: others.length ? 'warn' : 'ok', others };
}

/** После сохранения не личной записи дневника — какую скрытую черту игрок, похоже, нащупал. */
export function matchDiaryInBackground(roomId: string, entry: DiaryRow): void {
  if (!jevFeatures.diaryMatch() || isDemoRoom(roomId) || entry.private || !entry.characterId) return;
  const lc = loadCharacter(roomId, entry.characterId);
  if (!lc) return;
  const hidden = lc.doc.slots.map((s, i) => ({ s, i })).filter(({ s }) => !normRevealed(s.revealed).trait);
  if (!hidden.length) return;
  void (async () => {
    const res = await runDiaryMatch({ entry: entry.text, hidden: hidden.map(({ i }) => asTrait(lc.doc, i)) });
    if (!res.ok) return;
    // Пока Jev думал, игрок мог сделать запись личной, удалить или переписать её: тогда ответ выбрасываем.
    const now = getDiary(roomId, entry.id);
    if (!now || now.private || now.text !== entry.text) return;
    saveJudgment(roomId, 'diaryMatch.raw', entry.id, res.result.model, res.result.answers);
    const answers = res.result.answers as Record<string, { score?: number }>;
    const suggestions: DiarySuggestion[] = hidden
      .map(({ i }) => ({ traitName: cardOf(lc.doc.slots[i]).name, score: answers[`match_t${i}`]?.score ?? 0 }))
      .filter((s) => s.score >= DIARY_MATCH_MIN)
      .sort((a, b) => b.score - a.score);
    saveJudgment(roomId, 'diaryMatch.suggestions', entry.id, res.result.model, suggestions);
    publish(roomId, { kind: 'gm' }, 'gm:diary.changed', { entry: diaryForGm(now) });
  })().catch((err: unknown) => log().error({ err }, 'jev: diaryMatch'));
}

/** Заявка броска с текстом — не зелёная ли магия: мастеру «+1 к перегрузке?». */
export function greenForRollInBackground(roomId: string, roll: RollRow): void {
  if (!jevFeatures.greenMagic() || isDemoRoom(roomId) || !roll.label.trim() || !roll.characterId || roll.visibility === 'gm_hidden') return;
  const characterId = roll.characterId;
  const characterName = roll.characterName ?? '';
  void (async () => {
    const res = await runGreenMagic({ action: roll.label });
    if (!res.ok) return;
    saveJudgment(roomId, 'greenMagic', roll.id, res.result.model, res.result.answers);
    const p = res.result.answers.uses_green_magic.noul;
    if (p >= GREEN_MIN) publish(roomId, { kind: 'gm' }, 'gm:suggestion.green', { rollId: roll.id, characterId, characterName, probability: p });
  })().catch((err: unknown) => log().error({ err }, 'jev: greenMagic'));
}

/** Сводка: выдуманные факты по сравнению с данными, на которых она написана. */
export async function checkFacts(
  roomId: string,
  subject: string,
  data: unknown,
  text: string,
): Promise<{ status: HintCheck['status']; flagged: { sentence: string; probability: number }[] }> {
  if (!jevFeatures.leakGuard() || isDemoRoom(roomId)) return { status: 'off', flagged: [] };
  const sentences = splitSentences(text);
  if (!sentences.length) return { status: 'ok', flagged: [] };
  const res = await runFactCheck(data, sentences);
  if (!res.ok) return { status: 'unavailable', flagged: [] };
  saveJudgment(roomId, 'factCheck', subject, res.result.model, res.result.answers);
  const answers = res.result.answers as Record<string, { noul?: number }>;
  const flagged = sentences
    .map((sentence, i) => ({ sentence, probability: answers[`invented_s${i}`]?.noul ?? 0 }))
    .filter((f) => f.probability >= FACT_WARN);
  return { status: flagged.length ? 'warn' : 'ok', flagged };
}
