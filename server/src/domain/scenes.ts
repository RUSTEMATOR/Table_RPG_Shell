import { and, desc, eq } from 'drizzle-orm';
import { TableStateSchema, type GmScene, type TableState } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { db, schema } from '../db/client.ts';
import { imageUrl, removeImage, storeImage } from './media.ts';

export type SceneRow = typeof schema.scene.$inferSelect;

export function gmScene(r: SceneRow, shownId: string | null): GmScene {
  return {
    id: r.id,
    title: r.title,
    textPublic: r.textPublic,
    textGm: r.textGm,
    image: r.imageFile ? { url: imageUrl(r.imageFile), w: r.imageW ?? 0, h: r.imageH ?? 0, bytes: r.imageBytes ?? 0 } : null,
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
        .select({ name: schema.npc.name, imageFile: schema.npc.imageFile, imageW: schema.npc.imageW, imageH: schema.npc.imageH })
        .from(schema.npc)
        .where(and(eq(schema.npc.roomId, roomId), eq(schema.npc.id, shown.npcId)))
        .get()
    : undefined;
  return TableStateSchema.parse({
    npc: n
      ? { name: n.name, ...(n.imageFile ? { image: { url: imageUrl(n.imageFile), w: n.imageW ?? 0, h: n.imageH ?? 0 } } : {}) }
      : null,
    scene: r
      ? {
          id: r.id,
          title: r.title,
          text: r.textPublic,
          ...(r.imageFile ? { image: { url: imageUrl(r.imageFile), w: r.imageW ?? 0, h: r.imageH ?? 0 } } : {}),
        }
      : null,
  });
}

export function createScene(roomId: string, w: { title: string; textPublic: string; textGm: string }): SceneRow {
  const now = Date.now();
  const row: SceneRow = { id: newId(), roomId, ...w, imageFile: null, imageW: null, imageH: null, imageBytes: null, createdAt: now, updatedAt: now };
  db.insert(schema.scene).values(row).run();
  return row;
}

export function updateScene(r: SceneRow, patch: Partial<Pick<SceneRow, 'title' | 'textPublic' | 'textGm'>>): SceneRow {
  const next = { ...r, ...patch, updatedAt: Date.now() };
  db.update(schema.scene).set({ ...patch, updatedAt: next.updatedAt }).where(eq(schema.scene.id, r.id)).run();
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
