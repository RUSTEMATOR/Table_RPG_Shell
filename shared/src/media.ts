import { z } from 'zod';

// Картинка игроку и столу (этап 40): полный файл, превью до 480 px и thumbhash — размытый плейсхолдер до загрузки.
// Превью и хэш уходят только вместе с url, то есть по тем же правилам видимости, что и сама картинка.
export const ImagePublicSchema = z.strictObject({ url: z.string(), thumb: z.string(), hash: z.string().nullable(), w: z.number(), h: z.number() });
export type ImagePublic = z.infer<typeof ImagePublicSchema>;

/** Мастеру — то же плюс размер файла. */
export interface GmImage extends ImagePublic {
  bytes: number;
}
