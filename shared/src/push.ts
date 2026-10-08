import { z } from 'zod';

// Push-уведомления (этап 41). Тело — без свободного текста: только имена мест, разделов и персонажей,
// которые адресат и так видит. Единственное место отправки — server/src/push/send.ts, с тем же предохранителем, что publish().

export const PushNoteSchema = z.strictObject({
  title: z.string().min(1).max(80),
  body: z.string().max(160),
  /** Куда открыть приложение по нажатию: путь внутри сайта. */
  url: z
    .string()
    .regex(/^\/[^\s]*$/)
    .max(200),
  /** Одинаковый tag заменяет прежнее уведомление, а не добавляет новое. */
  tag: z.string().min(1).max(60),
});
export type PushNote = z.infer<typeof PushNoteSchema>;

/** Что присылает браузер после pushManager.subscribe(). */
export const PushSubscribeSchema = z.strictObject({
  endpoint: z.string().url().max(1024),
  keys: z.strictObject({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(64) }),
  /** Коротко об устройстве («iPhone», «Chrome на Mac») — чтобы мастер мог понять, сколько устройств подписано. */
  label: z.string().trim().max(60).default(''),
});
export const PushUnsubscribeSchema = z.strictObject({ endpoint: z.string().url().max(1024) });

export const PushKeyResponseSchema = z.strictObject({ enabled: z.boolean(), key: z.string().nullable() });
export type PushKeyResponse = z.infer<typeof PushKeyResponseSchema>;
