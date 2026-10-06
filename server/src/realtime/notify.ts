import type { LoadedCharacter } from '../domain/repo.ts';
import { projectForPlayer } from '../visibility/character.ts';
import { notifyPieceMaps } from './maps.ts';
import { publish } from './publish.ts';

// Что последним ушло владельцу. Если проекция не изменилась (мастер поменял скрытое), игроку ничего не шлём:
// иначе сам факт события подсказывал бы, что мастер что-то трогал. После перезапуска кэш пуст —
// первое изменение уйдёт как есть, а при переподключении клиент и так перечитывает карточку.
const lastSent = new Map<string, string>();

/** Персонаж изменился: мастеру — сигнал перечитать, владельцу — его новая проекция, если она изменилась. */
export function notifyCharacterChanged(roomId: string, lc: LoadedCharacter, previousOwner?: string | null): void {
  publish(roomId, { kind: 'gm' }, 'gm:character.changed', { id: lc.row.id });
  // имя или фигурка могли смениться — карты с его фигуркой (уйдёт, только если видимое изменилось)
  notifyPieceMaps(roomId, { characterId: lc.row.id });
  if (previousOwner && previousOwner !== lc.row.ownerMemberId) {
    lastSent.delete(previousOwner);
    publish(roomId, { kind: 'member', memberId: previousOwner }, 'character:updated', { character: null });
  }
  const owner = lc.row.ownerMemberId;
  if (!owner) return;
  const character = projectForPlayer(lc);
  const json = JSON.stringify(character);
  if (lastSent.get(owner) === json) return;
  lastSent.set(owner, json);
  publish(roomId, { kind: 'member', memberId: owner }, 'character:updated', { character });
}
