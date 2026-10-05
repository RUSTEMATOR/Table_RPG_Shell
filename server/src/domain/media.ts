import { mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { newId } from '../auth/tokens.ts';
import { config } from '../config.ts';
import { db, schema } from '../db/client.ts';

// Картинки сцен и портреты противников: один конвейер, один каталог data/media.

const MAX_SIDE = 1920;
mkdirSync(config.MEDIA_DIR, { recursive: true });

export const imageUrl = (file: string) => `/api/media/${file}`;

/** Что принимаем на загрузку: сырое тело запроса с таким Content-Type, до 15 МБ. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
export const IMAGE_BODY_LIMIT = 15 * 1024 * 1024;

export interface StoredImage {
  imageFile: string;
  imageW: number;
  imageH: number;
  imageBytes: number;
}

/** Картинка → WebP не больше 1920 px по длинной стороне, EXIF-поворот учтён, метаданные выброшены. */
export async function storeImage(input: Buffer): Promise<StoredImage> {
  const { data, info } = await sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const file = `${newId()}.webp`;
  writeFileSync(join(config.MEDIA_DIR, file), data);
  return { imageFile: file, imageW: info.width, imageH: info.height, imageBytes: data.length };
}

export function removeImage(file: string | null): void {
  if (!file) return;
  try {
    unlinkSync(join(config.MEDIA_DIR, file));
  } catch {}
}

/**
 * Кому можно отдать файл. Мастеру комнаты — любую картинку её сцен и противников.
 * Столу — только картинку показанной сейчас сцены и портрет показанного противника. Игрокам — ничего.
 */
export function mediaAllowed(roomId: string, role: string, file: string): boolean {
  if (role !== 'gm' && role !== 'table') return false;
  const sceneRow = db
    .select({ id: schema.scene.id })
    .from(schema.scene)
    .where(and(eq(schema.scene.roomId, roomId), eq(schema.scene.imageFile, file)))
    .get();
  const npcRow = sceneRow
    ? undefined
    : db
        .select({ id: schema.npc.id })
        .from(schema.npc)
        .where(and(eq(schema.npc.roomId, roomId), eq(schema.npc.imageFile, file)))
        .get();
  if (!sceneRow && !npcRow) return false;
  if (role === 'gm') return true;
  const shown = db.select().from(schema.tableState).where(eq(schema.tableState.roomId, roomId)).get();
  return sceneRow ? shown?.sceneId === sceneRow.id : shown?.npcId === npcRow!.id;
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
