import { and, desc, eq } from 'drizzle-orm';
import { TableStateSchema, type GmScene, type TableState } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { NO_IMAGE, imageGm, imagePublic, removeImage, storeImage } from './media.ts';
import { tableMap } from './maps.ts';
import { npcFigure } from './npc.ts';
import { activeSession } from './session.ts';

export type SceneRow = typeof schema.scene.$inferSelect;

export function gmScene(r: SceneRow, shownId: string | null): GmScene {
  return {
    id: r.id,
    title: r.title,
    textPublic: r.textPublic,
    textGm: r.textGm,
    image: imageGm(r),
    shown: r.id === shownId,
    updatedAt: r.updatedAt,
  };
}

export function listScenes(roomId: string): SceneRow[] {
  return db.select().from(schema.scene).where(eq(schema.scene.roomId, roomId)).orderBy(desc(schema.scene.updatedAt)).all();
}

export function getScene(roomId: string, id: string): SceneRow | undefined {
  return db
    .select()
    .from(schema.scene)
    .where(and(eq(schema.scene.roomId, roomId), eq(schema.scene.id, id)))
    .get();
}

export function shownSceneId(roomId: string): string | null {
  return db.select().from(schema.tableState).where(eq(schema.tableState.roomId, roomId)).get()?.sceneId ?? null;
}

export function setShown(roomId: string, sceneId: string | null): void {
  const now = Date.now();
  db.insert(schema.tableState)
    .values({ roomId, sceneId, updatedAt: now })
    .onConflictDoUpdate({ target: schema.tableState.roomId, set: { sceneId, updatedAt: now } })
    .run();
}

export function shownNpcId(roomId: string): string | null {
  return db.select().from(schema.tableState).where(eq(schema.tableState.roomId, roomId)).get()?.npcId ?? null;
}

export function setShownNpc(roomId: string, npcId: string | null): void {
  const now = Date.now();
  db.insert(schema.tableState)
    .values({ roomId, npcId, updatedAt: now })
    .onConflictDoUpdate({ target: schema.tableState.roomId, set: { npcId, updatedAt: now } })
    .run();
}

/** Единственное место, где сцена и противник превращаются в то, что видит стол. textGm, сила и заметки не читаются. */
export function projectForTable(roomId: string): TableState {
  const shown = db.select().from(schema.tableState).where(eq(schema.tableState.roomId, roomId)).get();
  const r = shown?.sceneId ? getScene(roomId, shown.sceneId) : undefined;
  const n = shown?.npcId
    ? db
        .select({
          name: schema.npc.name,
          imageFile: schema.npc.imageFile,
          imageW: schema.npc.imageW,
          imageH: schema.npc.imageH,
          imageHash: schema.npc.imageHash,
          figure: schema.npc.figure,
        })
        .from(schema.npc)
        .where(and(eq(schema.npc.roomId, roomId), eq(schema.npc.id, shown.npcId)))
        .get()
    : undefined;
  const map = tableMap(roomId);
  return TableStateSchema.parse({
    map: map ? { id: map.mapId, focus: map.focus } : null,
    npc: n
      ? {
          name: n.name,
          ...(n.imageFile ? { image: imagePublic(n) } : {}),
          figure: npcFigure(n),
          opponent: activeSession(roomId).opponentNpcId === shown?.npcId,
        }
      : null,
    scene: r
      ? {
          id: r.id,
          title: r.title,
          text: r.textPublic,
          ...(r.imageFile ? { image: imagePublic(r) } : {}),
        }
      : null,
  });
}

export function createScene(roomId: string, w: { title: string; textPublic: string; textGm: string }): SceneRow {
  const now = Date.now();
  const row: SceneRow = { id: newId(), roomId, ...w, ...NO_IMAGE, createdAt: now, updatedAt: now };
  db.insert(schema.scene).values(row).run();
  return row;
}

export function updateScene(r: SceneRow, patch: Partial<Pick<SceneRow, 'title' | 'textPublic' | 'textGm'>>): SceneRow {
  const next = { ...r, ...patch, updatedAt: Date.now() };
  db.update(schema.scene)
    .set({ ...patch, updatedAt: next.updatedAt })
    .where(eq(schema.scene.id, r.id))
    .run();
  return next;
}

/** Картинка сцены: см. storeImage. Старый файл удаляется. */
export async function setSceneImage(r: SceneRow, input: Buffer): Promise<SceneRow> {
  const img = await storeImage(input);
  removeImage(r.imageFile);
  const patch = { ...img, updatedAt: Date.now() };
  db.update(schema.scene).set(patch).where(eq(schema.scene.id, r.id)).run();
  return { ...r, ...patch };
}

export function deleteScene(r: SceneRow): void {
  removeImage(r.imageFile);
  db.delete(schema.scene).where(eq(schema.scene.id, r.id)).run();
}
