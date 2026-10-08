import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  FigureSchema,
  MAP_IDS,
  MapFocusSchema,
  PartyMoveSchema,
  PlaceKindSchema,
  RegionLabelSchema,
  SideSchema,
  type Figure,
  type GmMapPiece,
  type GmMapView,
  type MapFocus,
  type MapId,
  type PartyMove,
  type UnitId,
} from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { SERVER_ROOT } from '../paths.ts';
import { listNpcs, npcFigure, npcModel } from './npc.ts';
import { listCharacters } from './repo.ts';
import { figuresOf, listParties, namesOf } from './parties.ts';

// Карты мира. Неизменная часть (контуры, имена, подписи регионов, исходные места и дороги) — из server/src/maps/json
// (tools/extract-maps). В базе — что открыто, места (их можно править), заметки мастера, маркер партии, заметки игроков.

const Pt = z.tuple([z.number(), z.number()]);
const Shape = z.array(z.array(Pt));
const SourceSchema = z.object({
  id: z.enum(MAP_IDS),
  title: z.string(),
  parent: z.enum(MAP_IDS).nullable(),
  regions: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      shape: Shape,
      fill: z.string().nullable(),
      edge: z.string(),
      border: z.boolean().optional(),
      link: z.enum(MAP_IDS).optional(),
      label: RegionLabelSchema,
      extra: z.array(z.object({ shape: Shape, fill: z.string() })).optional(),
    }),
  ),
  places: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      kind: PlaceKindSchema,
      x: z.number(),
      y: z.number(),
      side: SideSchema,
      ink: z.string().optional(),
      subtitle: z.string().optional(),
    }),
  ),
  roads: z.array(z.object({ a: z.string(), b: z.string(), d: z.string() })),
});
export type MapSource = z.infer<typeof SourceSchema>;
export type SourceRegion = MapSource['regions'][number];

const JSON_DIR = join(SERVER_ROOT, 'src', 'maps', 'json');
export const MAPS: Record<MapId, MapSource> = Object.fromEntries(
  MAP_IDS.map((id) => {
    const r = SourceSchema.safeParse(JSON.parse(readFileSync(join(JSON_DIR, `${id}.json`), 'utf8')));
    if (!r.success) throw new Error(`maps/json/${id}.json: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`);
    return [id, r.data];
  }),
) as Record<MapId, MapSource>;

export type RegionRow = typeof schema.mapRegion.$inferSelect;
export type PlaceRow = typeof schema.mapPlace.$inferSelect;

/**
 * Регионы и исходные места карт в базе комнаты. Повторный вызов ничего не дублирует и не трогает
 * то, что мастер уже открыл, переименовал или удалил: удалённое исходное место помечается и не возвращается.
 */
export function ensureMaps(roomId: string): number {
  const now = Date.now();
  let added = 0;
  db.transaction((tx) => {
    for (const id of MAP_IDS) {
      const src = MAPS[id];
      for (const r of src.regions) {
        const res = tx.insert(schema.mapRegion).values({ id: newId(), roomId, mapId: id, key: r.key, visible: false, noteGm: '', updatedAt: now }).onConflictDoNothing().run();
        added += res.changes;
      }
      for (const p of src.places) {
        const res = tx
          .insert(schema.mapPlace)
          .values({
            id: newId(),
            roomId,
            mapId: id,
            key: p.key,
            name: p.name,
            kind: p.kind,
            x: p.x,
            y: p.y,
            side: p.side,
            subtitle: p.subtitle ?? '',
            ink: p.ink ?? null,
            visible: false,
            noteGm: '',
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .run();
        added += res.changes;
      }
    }
  });
  return added;
}

export function regionRows(roomId: string, mapId: MapId): RegionRow[] {
  return db
    .select()
    .from(schema.mapRegion)
    .where(and(eq(schema.mapRegion.roomId, roomId), eq(schema.mapRegion.mapId, mapId)))
    .all();
}

/** Места карты, кроме удалённых мастером исходных (kind = 'deleted'). Порядок — сверху вниз: он не выдаёт ни возраст, ни число скрытых. */
export function placeRows(roomId: string, mapId: MapId): PlaceRow[] {
  return db
    .select()
    .from(schema.mapPlace)
    .where(and(eq(schema.mapPlace.roomId, roomId), eq(schema.mapPlace.mapId, mapId)))
    .all()
    .filter((p) => p.kind !== 'deleted')
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function getPlace(roomId: string, id: string): PlaceRow | undefined {
  return db
    .select()
    .from(schema.mapPlace)
    .where(and(eq(schema.mapPlace.roomId, roomId), eq(schema.mapPlace.id, id)))
    .get();
}

export function getRegion(roomId: string, id: string): RegionRow | undefined {
  return db
    .select()
    .from(schema.mapRegion)
    .where(and(eq(schema.mapRegion.roomId, roomId), eq(schema.mapRegion.id, id)))
    .get();
}

export function sourceRegion(mapId: MapId, key: string): SourceRegion | undefined {
  return MAPS[mapId].regions.find((r) => r.key === key);
}

export function updateRegion(r: RegionRow, patch: { visible?: boolean; noteGm?: string }): void {
  db.update(schema.mapRegion)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(schema.mapRegion.id, r.id))
    .run();
}

export function createPlace(
  roomId: string,
  mapId: MapId,
  p: { name: string; kind: string; x: number; y: number; side: 'l' | 'r' | 'b'; subtitle: string; visible: boolean; noteGm: string },
): PlaceRow {
  const now = Date.now();
  const row: PlaceRow = {
    id: newId(),
    roomId,
    mapId,
    key: null,
    ink: null,
    description: '',
    ruler: '',
    faction: '',
    population: '',
    imageFile: null,
    imageW: null,
    imageH: null,
    imageBytes: null,
    createdAt: now,
    updatedAt: now,
    ...p,
  };
  db.insert(schema.mapPlace).values(row).run();
  return row;
}

export function updatePlace(
  p: PlaceRow,
  patch: Partial<Pick<PlaceRow, 'name' | 'kind' | 'x' | 'y' | 'side' | 'subtitle' | 'visible' | 'noteGm' | 'description' | 'ruler' | 'faction' | 'population'>>,
): void {
  db.update(schema.mapPlace)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(schema.mapPlace.id, p.id))
    .run();
}

/** Удаление: добавленное мастером — стирается; исходное — помечается, чтобы повторная загрузка карт его не вернула. */
export function deletePlace(p: PlaceRow): void {
  if (p.key) db.update(schema.mapPlace).set({ kind: 'deleted', visible: false, updatedAt: Date.now() }).where(eq(schema.mapPlace.id, p.id)).run();
  else db.delete(schema.mapPlace).where(eq(schema.mapPlace.id, p.id)).run();
}

export function getParty(roomId: string) {
  return db.select().from(schema.mapParty).where(eq(schema.mapParty.roomId, roomId)).get() ?? null;
}

export function setParty(roomId: string, v: { mapId: MapId; x: number; y: number; visible: boolean } | null): void {
  if (!v) {
    db.delete(schema.mapParty).where(eq(schema.mapParty.roomId, roomId)).run();
    return;
  }
  const now = Date.now();
  // переставили руками — похода нет (move — только у пути по дороге, setPartyMove)
  db.insert(schema.mapParty)
    .values({ roomId, ...v, move: null, updatedAt: now })
    .onConflictDoUpdate({ target: schema.mapParty.roomId, set: { ...v, move: null, updatedAt: now } })
    .run();
}

/** Отряд прошёл путь: сразу в конце пути, путь — для анимации у всех. */
export function setPartyMove(roomId: string, mapId: MapId, to: { x: number; y: number }, move: Omit<PartyMove, 'seq'>, visible: boolean): PartyMove {
  const seq = (partyMove(getParty(roomId))?.seq ?? 0) + 1;
  const m: PartyMove = { ...move, seq };
  const now = Date.now();
  const v = { mapId, x: to.x, y: to.y, visible, move: JSON.stringify(m), updatedAt: now };
  db.insert(schema.mapParty)
    .values({ roomId, ...v })
    .onConflictDoUpdate({ target: schema.mapParty.roomId, set: v })
    .run();
  return m;
}

/** Что сейчас на столе из карт. Неверный JSON фокуса считается «вся карта». */
export function tableMap(roomId: string): { mapId: MapId; focus: MapFocus | null } | null {
  const row = db.select({ mapId: schema.tableState.mapId, mapFocus: schema.tableState.mapFocus }).from(schema.tableState).where(eq(schema.tableState.roomId, roomId)).get();
  const id = MAP_IDS.find((m) => m === row?.mapId);
  if (!id) return null;
  let focus: MapFocus | null = null;
  try {
    const f = MapFocusSchema.safeParse(JSON.parse(row?.mapFocus ?? 'null'));
    if (f.success) focus = f.data;
  } catch {
    focus = null;
  }
  return { mapId: id, focus };
}

export function setTableMap(roomId: string, mapId: MapId | null, focus: MapFocus | null): void {
  const now = Date.now();
  const v = { mapId, mapFocus: mapId && focus ? JSON.stringify(focus) : null };
  db.insert(schema.tableState)
    .values({ roomId, ...v, updatedAt: now })
    .onConflictDoUpdate({ target: schema.tableState.roomId, set: { ...v, updatedAt: now } })
    .run();
}

/** Дороги между существующими местами; open — открыты оба конца. a, b — id мест (не ключи исходных данных). */
export function roads(mapId: MapId, places: PlaceRow[]): { d: string; open: boolean; a: string; b: string }[] {
  const byKey = new Map(places.filter((p) => p.key).map((p) => [p.key!, p]));
  return MAPS[mapId].roads.flatMap((r) => {
    const a = byKey.get(r.a),
      b = byKey.get(r.b);
    return a && b ? [{ d: r.d, open: a.visible && b.visible, a: a.id, b: b.id }] : [];
  });
}

/** Последний поход отряда из базы; неверный JSON — похода нет. */
export function partyMove(row: { move: string | null } | null): PartyMove | null {
  if (!row?.move) return null;
  try {
    const m = PartyMoveSchema.safeParse(JSON.parse(row.move));
    return m.success ? m.data : null;
  } catch {
    return null;
  }
}

// ---- Фигурки на карте (этап 24) ----

export type TokenRow = typeof schema.mapToken.$inferSelect;

/** Фигурки карты сверху вниз: порядок не выдаёт ни возраст, ни число скрытых. */
export function tokenRows(roomId: string, mapId: MapId): TokenRow[] {
  return db
    .select()
    .from(schema.mapToken)
    .where(and(eq(schema.mapToken.roomId, roomId), eq(schema.mapToken.mapId, mapId)))
    .all()
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function getToken(roomId: string, id: string): TokenRow | undefined {
  return db
    .select()
    .from(schema.mapToken)
    .where(and(eq(schema.mapToken.roomId, roomId), eq(schema.mapToken.id, id)))
    .get();
}

/** Персонаж или противник, которого можно поставить на карту. owner — только для сервера (чья фигурка у игрока «своя»); model — 3D-модель противника (этап 34). */
export type Piece = GmMapPiece & { owner: string | null; model: UnitId | null };
const figureOf = (v: unknown): Figure | null => {
  const f = FigureSchema.safeParse(v);
  return f.success ? f.data : null;
};
export function pieces(roomId: string): Piece[] {
  return [
    ...listCharacters(roomId)
      .sort((a, b) => a.row.name.localeCompare(b.row.name, 'ru'))
      .map((c) => ({ kind: 'pc' as const, refId: c.row.id, name: c.row.name, figure: figureOf(c.doc.figure), owner: c.row.ownerMemberId, model: null })),
    ...listNpcs(roomId).map((n) => ({ kind: 'npc' as const, refId: n.id, name: n.name, figure: npcFigure(n), owner: null, model: npcModel(n) })),
  ];
}
export const refOf = (t: Pick<TokenRow, 'characterId' | 'npcId'>) => (t.characterId ? `pc:${t.characterId}` : `npc:${t.npcId}`);
export const pieceKey = (p: Pick<Piece, 'kind' | 'refId'>) => `${p.kind}:${p.refId}`;

export function addToken(roomId: string, mapId: MapId, piece: Piece, x: number, y: number, visible: boolean): TokenRow {
  const now = Date.now();
  // персонаж — одна фигурка на карте: повторная постановка переносит её
  if (piece.kind === 'pc') {
    const had = tokenRows(roomId, mapId).find((t) => t.characterId === piece.refId);
    if (had) {
      db.update(schema.mapToken).set({ x, y, visible, updatedAt: now }).where(eq(schema.mapToken.id, had.id)).run();
      return { ...had, x, y, visible, updatedAt: now };
    }
  }
  const row: TokenRow = {
    id: newId(),
    roomId,
    mapId,
    characterId: piece.kind === 'pc' ? piece.refId : null,
    npcId: piece.kind === 'npc' ? piece.refId : null,
    x,
    y,
    visible,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.mapToken).values(row).run();
  return row;
}

export function updateToken(t: TokenRow, patch: { x?: number; y?: number; visible?: boolean }): void {
  db.update(schema.mapToken)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(schema.mapToken.id, t.id))
    .run();
}

export function deleteToken(t: TokenRow): void {
  db.delete(schema.mapToken).where(eq(schema.mapToken.id, t.id)).run();
}

/** Карты, где стоит фигурка этого персонажа или противника (чтобы сообщить об их смене имени или внешности). */
export function mapsWithPiece(roomId: string, ref: { characterId: string } | { npcId: string }): MapId[] {
  const col = 'characterId' in ref ? eq(schema.mapToken.characterId, ref.characterId) : eq(schema.mapToken.npcId, ref.npcId);
  const ids = db
    .select({ mapId: schema.mapToken.mapId })
    .from(schema.mapToken)
    .where(and(eq(schema.mapToken.roomId, roomId), col))
    .all();
  return MAP_IDS.filter((m) => ids.some((r) => r.mapId === m));
}

const label = (r: SourceRegion) => r.label;

/** Мастеру — карта целиком: все регионы и места, заметки, где партия, что на столе. */
export function gmMapView(roomId: string, mapId: MapId): GmMapView {
  ensureMaps(roomId);
  const src = MAPS[mapId];
  const rows = new Map(regionRows(roomId, mapId).map((r) => [r.key, r]));
  const places = placeRows(roomId, mapId);
  const all = pieces(roomId);
  const byRef = new Map(all.map((p) => [pieceKey(p), p]));
  return {
    id: mapId,
    title: src.title,
    parent: src.parent,
    regions: src.regions.flatMap((r) => {
      const row = rows.get(r.key);
      if (!row) return [];
      return [
        {
          id: row.id,
          key: r.key,
          name: r.name,
          shape: r.shape,
          fill: r.fill,
          edge: r.edge,
          border: !!r.border,
          link: r.link ?? null,
          label: label(r),
          extra: r.extra ?? [],
          visible: row.visible,
          noteGm: row.noteGm,
        },
      ];
    }),
    places: places.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      kind: PlaceKindSchema.catch('mark').parse(p.kind),
      x: p.x,
      y: p.y,
      side: p.side,
      subtitle: p.subtitle,
      ink: p.ink,
      visible: p.visible,
      noteGm: p.noteGm,
    })),
    roads: roads(mapId, places),
    parties: listParties(roomId).map((p) => ({
      id: p.id,
      main: p.main,
      mapId: p.mapId,
      x: p.x,
      y: p.y,
      visible: p.visible,
      move: partyMove(p),
      figures: figuresOf(all, p.members),
      names: namesOf(all, p.members),
      members: all.flatMap((x) => (x.kind === 'pc' && p.members.includes(x.refId) ? [{ characterId: x.refId, name: x.name }] : [])),
    })),
    table: tableMap(roomId),
    tokens: tokenRows(roomId, mapId).flatMap((t) => {
      const p = byRef.get(refOf(t));
      return p ? [{ id: t.id, kind: p.kind, refId: p.refId, name: p.name, figure: p.figure, model: p.model, x: t.x, y: t.y, visible: t.visible }] : [];
    }),
    pieces: all.map(({ owner: _owner, model: _model, ...p }) => p),
  };
}
