import type { LoadedCharacter } from '../domain/repo.ts';
import { projectForPlayer } from '../visibility/character.ts';
import { publish } from './publish.ts';

/** Персонаж изменился: мастеру — сигнал перечитать, владельцу — его новая проекция. */
export function notifyCharacterChanged(roomId: string, lc: LoadedCharacter, previousOwner?: string | null): void {
  publish(roomId, { kind: 'gm' }, 'gm:character.changed', { id: lc.row.id });
  if (previousOwner && previousOwner !== lc.row.ownerMemberId)
    publish(roomId, { kind: 'member', memberId: previousOwner }, 'character:updated', { character: null });
  if (lc.row.ownerMemberId)
    publish(roomId, { kind: 'member', memberId: lc.row.ownerMemberId }, 'character:updated', { character: projectForPlayer(lc) });
}
