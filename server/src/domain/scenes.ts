import { mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { TableStateSchema, type GmScene, type TableState } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { config } from '../config.ts';
import { db, schema } from '../db/client.ts';

export type SceneRow = typeof schema.scene.$inferSelect;

const MAX_SIDE = 1920;
mkdirSync(config.MEDIA_DIR, { recursive: true });

const imageUrl = (file: string) => `/api/media/${file}`;

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

/** Единственное место, где сцена превращается в то, что видит стол. textGm не читается. */
export function projectForTable(roomId: string): TableState {
  const id = shownSceneId(roomId);
  const r = id ? getScene(roomId, id) : undefined;
  return TableStateSchema.parse({
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

function removeFile(file: string | null) {
  if (!file) return;
  try {
    unlinkSync(join(config.MEDIA_DIR, file));
  } catch {}
}

/** Картинка → WebP не больше 1920 px по длинной стороне, EXIF-поворот учтён, метаданные выброшены. */
export async function setSceneImage(r: SceneRow, input: Buffer): Promise<SceneRow> {
  const { data, info } = await sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const file = `${newId()}.webp`;
  writeFileSync(join(config.MEDIA_DIR, file), data);
  removeFile(r.imageFile);
  const patch = { imageFile: file, imageW: info.width, imageH: info.height, imageBytes: data.length, updatedAt: Date.now() };
  db.update(schema.scene).set(patch).where(eq(schema.scene.id, r.id)).run();
  return { ...r, ...patch };
}

export function deleteScene(r: SceneRow): void {
  removeFile(r.imageFile);
  db.delete(schema.scene).where(eq(schema.scene.id, r.id)).run();
}

/** Кому можно отдать файл: мастеру комнаты — любой её сцены, столу — только показанной сейчас. */
export function mediaAllowed(roomId: string, role: string, file: string): boolean {
  const r = db
    .select()
    .from(schema.scene)
    .where(and(eq(schema.scene.roomId, roomId), eq(schema.scene.imageFile, file)))
    .get();
  if (!r) return false;
  if (role === 'gm') return true;
  return role === 'table' && shownSceneId(roomId) === r.id;
}

export function mediaPath(file: string): string | null {
  if (!/^[a-z0-9]{16}\.webp$/.test(file)) return null;
  const p = join(config.MEDIA_DIR, file);
  try {
    statSync(p);
    return p;
  } catch {
    return null;
  }
}
