import { and, eq } from 'drizzle-orm';
import {
  MapIdSchema,
  MapPublicSchema,
  PlaceDetailPublicSchema,
  PlaceKindSchema,
  partyNear,
  RumorKindSchema,
  SpotKindSchema,
  type MapId,
  type MapNote,
  type MapPublic,
  type PlaceDetailPublic,
} from '@zg/shared';
import { db, schema } from '../db/client.ts';
import { MAPS, ensureMaps, getParty, getPlace, partyFigures, partyMove, type PlaceRow, pieceKey, pieces, placeRows, refOf, regionRows, roads, tokenRows } from '../domain/maps.ts';
import { imageUrl } from '../domain/media.ts';
import { npcFigure } from '../domain/npc.ts';
import { presenceRows, rumorRows, spotRows } from '../domain/places.ts';

// Единственное место, где карта превращается в то, что видят игрок и стол.
// Уходят только открытые регионы (контур, имя, подпись) и открытые места, без note_gm и без ключей исходных данных.
// Скрытые регионы не оставляют ни контура, ни счётчика: закрытое на клиенте — общий туман.
// Дорога — только если открыты оба её конца (с id этих мест — для маршрута). Маркер партии — если он на этой карте
// и не спрятан; с последним походом (путь только по открытым дорогам и местам, domain/travel.ts) и фигурками персонажей
// игроков (имя и внешность, без id).
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
      .map((r) => ({ d: r.d, a: r.a, b: r.b })),
    party: party && party.visible && party.mapId === mapId ? { x: party.x, y: party.y, move: partyMove(party), figures: partyFigures(pieces(roomId)) } : null,
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

/**
 * Место для игрока и стола (этап 27): карточка и экран города. null — места нет или оно скрыто (тогда — 404).
 * Уходят только видимые места в городе, открытые слухи (в порядке открытия, без времён) и открытые «кто здесь»
 * (имя и фигурка противника из библиотеки, роль от мастера; без id противника, силы, заметок, портрета).
 * Скрытое не оставляет ни следа, ни счётчика; note_gm не читается. На выходе — PlaceDetailPublicSchema.parse.
 */
export function projectPlaceDetail(roomId: string, placeId: string, viewer: 'player' | 'table'): PlaceDetailPublic | null {
  const p = getPlace(roomId, placeId);
  if (!p || !p.visible || p.kind === 'deleted') return null;
  // войти в город игрок может, только когда отряд рядом (и виден игрокам); иначе — лишь карточка снаружи
  const party = getParty(roomId);
  const inside = viewer === 'table' || (!!party && party.visible && party.mapId === p.mapId && partyNear(p, party));
  if (!inside) return outside(p);
  const spots = spotRows(p.id).filter((s) => s.visible);
  const spotIds = new Set(spots.map((s) => s.id));
  const here = presenceRows(p.id)
    .filter(({ p: x }) => x.visible)
    .map(({ p: x, name, figure }) => ({ spotId: x.spotId && spotIds.has(x.spotId) ? x.spotId : null, v: { id: x.id, name, label: x.label, figure: npcFigure({ figure }) } }));
  return PlaceDetailPublicSchema.parse({
    ...card(p),
    inside: true,
    spots: spots.map((s) => ({
      id: s.id,
      kind: SpotKindSchema.catch('other').parse(s.kind),
      name: s.name,
      description: s.description,
      here: here.filter((h) => h.spotId === s.id).map((h) => h.v),
    })),
    rumors: rumorRows(p.id)
      .filter((r) => r.visible)
      .sort((a, b) => (a.revealedAt ?? 0) - (b.revealedAt ?? 0))
      .map((r) => ({ id: r.id, kind: RumorKindSchema.catch('rumor').parse(r.kind), text: r.text })),
    here: here.filter((h) => h.spotId === null).map((h) => h.v),
  });
}

/** Карточка места снаружи: что видно издали. */
function card(p: PlaceRow) {
  return {
    id: p.id,
    mapId: MapIdSchema.parse(p.mapId),
    name: p.name,
    kind: PlaceKindSchema.catch('mark').parse(p.kind),
    subtitle: p.subtitle,
    ink: p.ink,
    description: p.description,
    ruler: p.ruler,
    faction: p.faction,
    population: p.population,
    image: p.imageFile ? { url: imageUrl(p.imageFile), w: p.imageW ?? 0, h: p.imageH ?? 0 } : null,
  };
}

/** Отряд далеко: внутренности города (места, слухи, кто здесь) не уходят вовсе. */
function outside(p: PlaceRow): PlaceDetailPublic {
  return PlaceDetailPublicSchema.parse({ ...card(p), inside: false, spots: [], rumors: [], here: [] });
}
