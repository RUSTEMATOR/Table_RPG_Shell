import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import type { GmImage, ImagePublic } from '@zg/shared';
import { newId } from '../auth/tokens.ts';
import { config } from '../config.ts';
import { db, schema } from '../db/client.ts';

// Картинки сцен, портреты противников и картинки мест: один конвейер, один каталог data/media.
// Этап 40: рядом с полным файлом <id>.webp лежит превью <id>.t.webp (до 480 px), а в строке — thumbhash (base64).

const MAX_SIDE = 1920;
const THUMB_SIDE = 480;
mkdirSync(config.MEDIA_DIR, { recursive: true });

export const imageUrl = (file: string) => `/api/media/${file}`;
const thumbFile = (file: string) => file.replace(/\.webp$/, '.t.webp');

type ImageRow = { imageFile: string | null; imageW: number | null; imageH: number | null; imageBytes?: number | null; imageHash: string | null };

/** Картинка игроку и столу: url, превью, хэш, размеры. null — картинки нет. */
export function imagePublic(r: ImageRow): ImagePublic | null {
  if (!r.imageFile) return null;
  return { url: imageUrl(r.imageFile), thumb: imageUrl(thumbFile(r.imageFile)), hash: r.imageHash, w: r.imageW ?? 0, h: r.imageH ?? 0 };
}

/** Мастеру — то же плюс размер файла. */
export function imageGm(r: ImageRow): GmImage | null {
  const p = imagePublic(r);
  return p ? { ...p, bytes: r.imageBytes ?? 0 } : null;
}

/** Что принимаем на загрузку: сырое тело запроса с таким Content-Type, до 15 МБ. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
export const IMAGE_BODY_LIMIT = 15 * 1024 * 1024;

export interface StoredImage {
  imageFile: string;
  imageW: number;
  imageH: number;
  imageBytes: number;
  imageHash: string;
}

/** Превью до 480 px и thumbhash из уже сжатого WebP. */
async function derive(full: Buffer, file: string): Promise<string> {
  const thumb = await sharp(full).resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
  writeFileSync(join(config.MEDIA_DIR, thumbFile(file)), thumb);
  // thumbhash считается по картинке не больше 100 px
  const { data, info } = await sharp(thumb).resize({ width: 100, height: 100, fit: 'inside' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64');
}

/** Картинка → WebP не больше 1920 px по длинной стороне, EXIF-поворот учтён, метаданные выброшены; плюс превью и хэш. */
export async function storeImage(input: Buffer): Promise<StoredImage> {
  const { data, info } = await sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  const file = `${newId()}.webp`;
  writeFileSync(join(config.MEDIA_DIR, file), data);
  const imageHash = await derive(data, file);
  return { imageFile: file, imageW: info.width, imageH: info.height, imageBytes: data.length, imageHash };
}

export const NO_IMAGE = { imageFile: null, imageW: null, imageH: null, imageBytes: null, imageHash: null } as const;

export function removeImage(file: string | null): void {
  if (!file) return;
  for (const f of [file, thumbFile(file)]) {
    try {
      unlinkSync(join(config.MEDIA_DIR, f));
    } catch {}
  }
}

/**
 * Картинки, загруженные до этапа 40: превью и хэша нет. Досчитываются при запуске сервера, в фоне, по одной;
 * пока не досчитано — hash: null, превью отдаёт 404, и клиент берёт полный файл.
 */
export async function backfillMedia(log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): Promise<void> {
  const tables = [schema.scene, schema.npc, schema.mapPlace, schema.chapterPhoto] as const;
  let n = 0;
  for (const t of tables) {
    const rows = db.select({ id: t.id, imageFile: t.imageFile }).from(t).all();
    for (const r of rows) {
      if (!r.imageFile) continue;
      const full = join(config.MEDIA_DIR, r.imageFile);
      if (!existsSync(full)) continue;
      const row = db.select({ imageHash: t.imageHash }).from(t).where(eq(t.id, r.id)).get();
      if (row?.imageHash && existsSync(join(config.MEDIA_DIR, thumbFile(r.imageFile)))) continue;
      try {
        const imageHash = await derive(readFileSync(full), r.imageFile);
        db.update(t).set({ imageHash }).where(eq(t.id, r.id)).run();
        n++;
      } catch (err) {
        log.warn({ err, file: r.imageFile }, 'media: превью не посчиталось');
      }
    }
  }
  if (n) log.info({ n }, 'media: превью и хэши досчитаны');
}

/**
 * Кому можно отдать файл. Мастеру комнаты — любую картинку её сцен, противников и мест.
 * Столу — только картинку показанной сейчас сцены и портрет показанного противника. Картинку места (этап 27) — игрокам
 * и столу, пока место открыто. Остальное игрокам — ничего.
 */
export function mediaAllowed(roomId: string, role: string, requested: string): boolean {
  // превью <id>.t.webp живёт по правилам своего полного файла
  const file = requested.replace(/\.t\.webp$/, '.webp');
  // фото сессии (этап 53): как глава — мастеру всегда, игрокам — если глава опубликована; столу — нет
  const photo = db
    .select({ status: schema.chapter.status })
    .from(schema.chapterPhoto)
    .innerJoin(schema.chapter, eq(schema.chapter.id, schema.chapterPhoto.chapterId))
    .where(and(eq(schema.chapterPhoto.roomId, roomId), eq(schema.chapterPhoto.imageFile, file)))
    .get();
  if (photo) return role === 'gm' || (role === 'player' && photo.status === 'published');
  const placeRow = db
    .select({ visible: schema.mapPlace.visible, kind: schema.mapPlace.kind })
    .from(schema.mapPlace)
    .where(and(eq(schema.mapPlace.roomId, roomId), eq(schema.mapPlace.imageFile, file)))
    .get();
  if (placeRow) return role === 'gm' || ((role === 'player' || role === 'table') && placeRow.visible && placeRow.kind !== 'deleted');
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
  if (!/^[a-z0-9]{16}(\.t)?\.webp$/.test(file)) return null;
  const p = join(config.MEDIA_DIR, file);
  try {
    statSync(p);
    return p;
  } catch {
    return null;
  }
}
