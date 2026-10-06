import type { MapId } from '@zg/shared';
import { mapsWithPiece } from '../domain/maps.ts';
import { projectMapPublic } from '../visibility/map.ts';
import { publish } from './publish.ts';

const lastSent = new Map<string, string>();

/**
 * Карта изменилась: мастеру — сигнал перечитать; игрокам и столу — только если их проекция действительно изменилась.
 * Иначе само событие подсказывало бы, что мастер трогал скрытое. После перезапуска кэш пуст — первое изменение уйдёт.
 */
export function notifyMapChanged(roomId: string, mapId: MapId): void {
  publish(roomId, { kind: 'gm' }, 'gm:map.changed', { mapId });
  const json = JSON.stringify(projectMapPublic(roomId, mapId));
  const key = `${roomId}:${mapId}`;
  if (lastSent.get(key) === json) return;
  lastSent.set(key, json);
  publish(roomId, { kind: 'public' }, 'map:changed', { mapId });
}

/** Персонаж или противник поменял имя или фигурку: карты, где стоит его фигурка. */
export function notifyPieceMaps(roomId: string, ref: { characterId: string } | { npcId: string }, maps = mapsWithPiece(roomId, ref)): void {
  maps.forEach((m) => notifyMapChanged(roomId, m));
}
