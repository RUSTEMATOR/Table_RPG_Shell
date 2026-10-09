import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { requireGm } from '../auth/requireGm.ts';
import { config } from '../config.ts';
import { sqlite } from '../db/client.ts';
import { isDemoRoom } from '../domain/demo.ts';
import { listBackups, makeBackup } from '../ops/backup.ts';

// Страница мастера «База» (этап 59): размеры, строки по таблицам, проверка целостности, снимки, статус Litestream.
// Содержимого таблиц и скачивания снимков нет намеренно: в базе — записи «только для меня», которые мастер не видит (правило 7).

const size = (p: string) => {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
};

function run(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 8000 }, (err, stdout, stderr) => resolve(err ? null : `${stdout}${stderr}`.trim()));
  });
}

async function litestream(): Promise<{ configured: boolean; bin: boolean; snapshots: string | null; generations: string | null }> {
  const cfg = config.LITESTREAM_CONFIG;
  const bin = config.LITESTREAM_BIN ?? '/opt/homebrew/bin/litestream';
  const hasBin = existsSync(bin);
  if (!cfg || !existsSync(cfg) || !hasBin) return { configured: !!cfg && existsSync(cfg), bin: hasBin, snapshots: null, generations: null };
  const [generations, snapshots] = await Promise.all([run(bin, ['generations', '-config', cfg, config.DB_PATH]), run(bin, ['snapshots', '-config', cfg, config.DB_PATH])]);
  // последние строки: вывод бывает длинным
  const tail = (s: string | null) => (s ? s.split('\n').slice(-8).join('\n').slice(0, 2000) : null);
  return { configured: true, bin: true, generations: tail(generations), snapshots: tail(snapshots) };
}

export async function gmDatabaseRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireGm);
  app.addHook('onRequest', async (request, reply) => {
    if (isDemoRoom(request.auth!.room.id)) return reply.code(404).send({ error: 'not_found' });
  });

  app.get('/api/gm/database', async () => {
    const tables = (
      sqlite
        .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%' and name not like 'search_doc%' order by name")
        .all() as { name: string }[]
    ).map(({ name }) => ({ name, rows: Number((sqlite.prepare(`select count(*) as n from "${name.replace(/"/g, '')}"`).get() as { n: number }).n) }));
    return {
      dbBytes: size(config.DB_PATH),
      walBytes: size(`${config.DB_PATH}-wal`),
      mediaDir: config.MEDIA_DIR,
      journalMode: String(sqlite.pragma('journal_mode', { simple: true })),
      pageSize: Number(sqlite.pragma('page_size', { simple: true })),
      tables,
      backups: listBackups().slice(0, 40),
      backupDir: config.BACKUP_DIR,
      mirror: !!config.BACKUP_MIRROR,
      litestream: await litestream(),
    };
  });

  app.post('/api/gm/database/check', async () => {
    const t = Date.now();
    const res = String(sqlite.pragma('quick_check', { simple: true }));
    return { ok: res === 'ok', result: res.slice(0, 500), ms: Date.now() - t };
  });

  let busy = false;
  app.post('/api/gm/database/backup', async (request, reply) => {
    if (busy) return reply.code(409).send({ error: 'busy' });
    busy = true;
    try {
      const b = await makeBackup('manual', (m) => request.log.info(m));
      return { ok: true, at: b.at, bytes: b.bytes };
    } catch (err) {
      request.log.error({ err }, 'database: снимок не удался');
      return reply.code(500).send({ error: 'backup_failed', message: (err as Error).message.slice(0, 200) });
    } finally {
      busy = false;
    }
  });
}
