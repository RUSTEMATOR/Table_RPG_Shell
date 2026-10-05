import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const envFile = process.env.ZG_ENV_FILE ?? join(homedir(), '.config/zelenogorye/.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const bool = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true');

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('production'),
  PORT: z.coerce.number().int().default(3000),
  DB_PATH: z.string().min(1),
  MEDIA_DIR: z.string().optional(),
  BACKUP_DIR: z.string().optional(),
  BACKUP_MIRROR: z.string().optional(),
  OPS_STATE_DIR: z.string().optional(),
  NGINX_BIN: z.string().optional(),
  CF_IPS_FILE: z.string().optional(),
  COOKIE_SECURE: bool(true),
  PUBLIC_ORIGIN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  JEV_API_KEY: z.string().optional(),
  JEV_MODEL: z.string().default('jev-1.13.0'),
  JEV_LEAK_GUARD: bool(false),
  JEV_DIARY_MATCH: bool(false),
  JEV_ROLL_INTENT: bool(false),
  JEV_GREEN_MAGIC: bool(false),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_SUMMARY: z.string().default('claude-sonnet-5-5'),
  ANTHROPIC_MODEL_DRAFT: z.string().default('claude-haiku-4-5'),
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  // Печатаем только имена полей, без значений: в env лежат ключи.
  const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(`Неверная конфигурация (${envFile}): ${fields}`);
}

export const config = {
  ...parsed.data,
  MEDIA_DIR: parsed.data.MEDIA_DIR ?? join(dirname(parsed.data.DB_PATH), 'media'),
  BACKUP_DIR: parsed.data.BACKUP_DIR ?? join(dirname(parsed.data.DB_PATH), 'backups'),
  // Сюда скрипты ops пишут отметки: последний бэкап, обновление IP Cloudflare, DDNS.
  OPS_STATE_DIR: parsed.data.OPS_STATE_DIR ?? join(dirname(parsed.data.DB_PATH), 'ops-state'),
  HOST: '127.0.0.1',
  envFile,
  isDev: parsed.data.NODE_ENV === 'development',
};

declare const __BUILD_ID__: string | undefined;
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
