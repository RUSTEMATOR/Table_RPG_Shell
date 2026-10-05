import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requireGm } from '../auth/requireGm.ts';
import { claudeConfigured } from '../ai/claude/client.ts';
import { BUILD_ID, config } from '../config.ts';
import { isDemoRoom } from '../domain/demo.ts';

// Страница «Состояние» для мастера: аптайм, размер базы, последний бэкап, nginx -t, IP Cloudflare, DDNS.

const started = Date.now();

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(config.OPS_STATE_DIR, file), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function size(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function dirSize(dir: string): number {
  try {
    return readdirSync(dir).reduce((n, f) => n + size(join(dir, f)), 0);
  } catch {
    return 0;
  }
}

function nginxCheck(): Promise<{ ok: boolean; output: string } | null> {
  if (!config.NGINX_BIN) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(config.NGINX_BIN!, ['-t'], { timeout: 5000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: `${stdout}${stderr}`.trim().slice(0, 1000) });
    });
  });
}

export async function statusRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.get('/api/gm/status', async (request, reply) => {
    // Состояние сервера (память, nginx, адрес DDNS) гостям демо-комнаты не показываем.
    if (isDemoRoom(request.auth!.room.id)) return reply.code(404).send({ error: 'not_found' });
    const cfFile = config.CF_IPS_FILE;
    return {
      build: BUILD_ID,
      env: config.NODE_ENV,
      uptimeSec: Math.round((Date.now() - started) / 1000),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      dbBytes: size(config.DB_PATH) + size(`${config.DB_PATH}-wal`),
      mediaBytes: dirSize(config.MEDIA_DIR),
      lastBackup: readJson('last-backup.json'),
      ddns: readJson('ddns.json'),
      cloudflareIpsUpdatedAt: cfFile && existsSync(cfFile) ? statSync(cfFile).mtimeMs : null,
      nginx: await nginxCheck(),
      jev: !!config.JEV_API_KEY,
      claude: claudeConfigured(),
    };
  });
}
