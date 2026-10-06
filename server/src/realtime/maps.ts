import type { MapId } from '@zg/shared';
import { MapIdSchema } from '@zg/shared';
import { getPlace, mapsWithPiece } from '../domain/maps.ts';
import { placesWithNpc } from '../domain/places.ts';
import { projectMapPublic, projectPlaceDetail } from '../visibility/map.ts';
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

/**
 * Карточка места изменилась (этап 27): мастеру — сигнал; игрокам и столу — только если открытая карточка действительно
 * изменилась (правка скрытого места, скрытого слуха или скрытого «кто здесь» событий им не порождает).
 */
export function notifyPlaceChanged(roomId: string, placeId: string): void {
  publish(roomId, { kind: 'gm' }, 'gm:place.changed', { placeId });
  const p = getPlace(roomId, placeId);
  const mapId = MapIdSchema.safeParse(p?.mapId);
  if (!mapId.success) return;
  const json = JSON.stringify(projectPlaceDetail(roomId, placeId));
  const key = `${roomId}:place:${placeId}`;
  if (lastSent.get(key) === json) return;
  // первый раз после запуска: скрытое место сигнала не даёт
  if (!lastSent.has(key) && json === 'null') {
    lastSent.set(key, json);
    return;
  }
  lastSent.set(key, json);
  publish(roomId, { kind: 'public' }, 'map:place.changed', { mapId: mapId.data, placeId });
}

/**
 * Персонаж или противник поменял имя или фигурку: карты, где стоит его фигурка, и города, где он «здесь».
 * places — заранее, если противник удаляется (каскад сотрёт строки «кто здесь»).
 */
export function notifyPieceMaps(
  roomId: string,
  ref: { characterId: string } | { npcId: string },
  maps = mapsWithPiece(roomId, ref),
  places = 'npcId' in ref ? placesWithNpc(roomId, ref.npcId) : [],
): void {
  maps.forEach((m) => notifyMapChanged(roomId, m));
  places.forEach((p) => notifyPlaceChanged(roomId, p));
}
