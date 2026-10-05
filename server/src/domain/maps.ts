import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { MAP_IDS, MapFocusSchema, PlaceKindSchema, RegionLabelSchema, SideSchema, type GmMapView, type MapFocus, type MapId } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { SERVER_ROOT } from '../paths.ts';

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
        const res = tx
          .insert(schema.mapRegion)
          .values({ id: newId(), roomId, mapId: id, key: r.key, visible: false, noteGm: '', updatedAt: now })
          .onConflictDoNothing()
          .run();
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

export function createPlace(roomId: string, mapId: MapId, p: { name: string; kind: string; x: number; y: number; side: 'l' | 'r' | 'b'; subtitle: string; visible: boolean; noteGm: string }): PlaceRow {
  const now = Date.now();
  const row: PlaceRow = { id: newId(), roomId, mapId, key: null, ink: null, createdAt: now, updatedAt: now, ...p };
  db.insert(schema.mapPlace).values(row).run();
  return row;
}

export function updatePlace(p: PlaceRow, patch: Partial<Pick<PlaceRow, 'name' | 'kind' | 'x' | 'y' | 'side' | 'subtitle' | 'visible' | 'noteGm'>>): void {
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
  db.insert(schema.mapParty)
    .values({ roomId, ...v, updatedAt: now })
    .onConflictDoUpdate({ target: schema.mapParty.roomId, set: { ...v, updatedAt: now } })
    .run();
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

/** Дороги, у которых открыты оба конца (по ключам исходных мест). */
export function roads(mapId: MapId, places: PlaceRow[]): { d: string; open: boolean }[] {
  const byKey = new Map(places.filter((p) => p.key).map((p) => [p.key!, p]));
  return MAPS[mapId].roads
    .filter((r) => byKey.has(r.a) && byKey.has(r.b))
    .map((r) => ({ d: r.d, open: !!byKey.get(r.a)?.visible && !!byKey.get(r.b)?.visible }));
}

const label = (r: SourceRegion) => r.label;

/** Мастеру — карта целиком: все регионы и места, заметки, где партия, что на столе. */
export function gmMapView(roomId: string, mapId: MapId): GmMapView {
  ensureMaps(roomId);
  const src = MAPS[mapId];
  const rows = new Map(regionRows(roomId, mapId).map((r) => [r.key, r]));
  const places = placeRows(roomId, mapId);
  const party = getParty(roomId);
  const partyMap = MAP_IDS.find((m) => m === party?.mapId);
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
    party: party && partyMap ? { mapId: partyMap, x: party.x, y: party.y, visible: party.visible } : null,
    table: tableMap(roomId),
  };
}
