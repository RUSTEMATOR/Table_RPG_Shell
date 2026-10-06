import { and, eq } from 'drizzle-orm';
import { MapPublicSchema, PlaceKindSchema, type MapId, type MapNote, type MapPublic } from '@zg/shared';
import { db, schema } from '../db/client.ts';
import { MAPS, ensureMaps, getParty, pieceKey, pieces, placeRows, refOf, regionRows, roads, tokenRows } from '../domain/maps.ts';

// Единственное место, где карта превращается в то, что видят игрок и стол.
// Уходят только открытые регионы (контур, имя, подпись) и открытые места, без note_gm и без ключей исходных данных.
// Скрытые регионы не оставляют ни контура, ни счётчика: закрытое на клиенте — общий туман.
// Дорога — только если открыты оба её конца. Маркер партии — если он на этой карте и не спрятан.
// Фигурки — только видимые: имя и внешность (FigureSchema), без id персонажа или противника, без силы и заметок.
// На выходе — MapPublicSchema.parse (strictObject на всех уровнях): лишнее поле — исключение.

export function projectMapPublic(roomId: string, mapId: MapId, memberId?: string): MapPublic {
  ensureMaps(roomId);
  const src = MAPS[mapId];
  const open = new Set(
    regionRows(roomId, mapId)
      .filter((r) => r.visible)
      .map((r) => r.key),
  );
  const ids = new Map(regionRows(roomId, mapId).map((r) => [r.key, r.id]));
  const places = placeRows(roomId, mapId);
  const party = getParty(roomId);
  const tokens = tokenRows(roomId, mapId).filter((t) => t.visible);
  const byRef = tokens.length ? new Map(pieces(roomId).map((p) => [pieceKey(p), p])) : new Map();
  return MapPublicSchema.parse({
    id: mapId,
    title: src.title,
    parent: src.parent,
    regions: src.regions
      .filter((r) => open.has(r.key))
      .map((r) => ({
        id: ids.get(r.key),
        name: r.name,
        shape: r.shape,
        fill: r.fill,
        edge: r.edge,
        border: !!r.border,
        link: r.link ?? null,
        label: r.label,
        extra: r.extra ?? [],
      })),
    places: places
      .filter((p) => p.visible)
      .map((p) => ({
        id: p.id,
        name: p.name,
        kind: PlaceKindSchema.catch('mark').parse(p.kind),
        x: p.x,
        y: p.y,
        side: p.side,
        subtitle: p.subtitle,
        ink: p.ink,
      })),
    roads: roads(mapId, places)
      .filter((r) => r.open)
      .map((r) => ({ d: r.d })),
    party: party && party.visible && party.mapId === mapId ? { x: party.x, y: party.y } : null,
    tokens: tokens.flatMap((t) => {
      const p = byRef.get(refOf(t));
      return p ? [{ id: t.id, kind: p.kind, name: p.name, figure: p.figure, x: t.x, y: t.y, mine: !!memberId && p.owner === memberId }] : [];
    }),
    notes: [],
  });
}

/** Заметки игрока на карте — только его собственные. */
export function playerNotes(roomId: string, memberId: string, mapId: MapId): MapNote[] {
  return db
    .select()
    .from(schema.mapPlayerNote)
    .where(and(eq(schema.mapPlayerNote.roomId, roomId), eq(schema.mapPlayerNote.memberId, memberId), eq(schema.mapPlayerNote.mapId, mapId)))
    .all()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((n) => ({ id: n.id, x: n.x, y: n.y, text: n.text, updatedAt: n.updatedAt }));
}

export function projectMapForPlayer(roomId: string, memberId: string, mapId: MapId): MapPublic {
  return MapPublicSchema.parse({ ...projectMapPublic(roomId, mapId, memberId), notes: playerNotes(roomId, memberId, mapId) });
}

export function projectMapForTable(roomId: string, mapId: MapId): MapPublic {
  return projectMapPublic(roomId, mapId);
}
