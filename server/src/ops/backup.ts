import { cpSync, createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import Database from 'better-sqlite3';
import { config } from '../config.ts';

// Снимок базы (этапы 1б и 59): SQLite backup API (безопасно при работающем сервере), integrity_check, gzip, копия картинок.
// Зовут и CLI (backup.mjs по расписанию launchd), и страница мастера «База» («Сделать снимок сейчас»).
// Хранение: 48 частых, 30 ежедневных, 20 ручных. BACKUP_MIRROR — второй каталог (внешний диск, iCloud Drive).

export type BackupKind = 'half' | 'daily' | 'manual';
export const KEEP: Record<BackupKind, number> = { half: 48, daily: 30, manual: 20 };

export function activeRecently(): boolean {
  const db = new Database(config.DB_PATH, { readonly: true, fileMustExist: true });
  try {
    const since = Date.now() - 3 * 60 * 60 * 1000;
    const r = db.prepare('select count(*) as n from roll where created_at > ?').get(since) as { n: number };
    return r.n > 0;
  } finally {
    db.close();
  }
}

function prune(dir: string, prefix: string, keep: number) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.sqlite.gz'))
    .sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, f));
}

/** Снимок: путь, размер. Ошибка целостности — исключение, файл не остаётся. */
export async function makeBackup(kind: BackupKind, log: (m: string) => void = () => {}): Promise<{ file: string; bytes: number; at: number }> {
  if (!existsSync(config.DB_PATH)) throw new Error(`Нет базы: ${config.DB_PATH}`);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  mkdirSync(config.BACKUP_DIR, { recursive: true });
  const tmp = join(config.BACKUP_DIR, `.tmp-${stamp}-${kind}.sqlite`);
  const src = new Database(config.DB_PATH, { fileMustExist: true });
  try {
    await src.backup(tmp);
  } finally {
    src.close();
  }
  const check = new Database(tmp, { readonly: true });
  const res = check.pragma('integrity_check', { simple: true });
  check.close();
  if (res !== 'ok') {
    rmSync(tmp);
    throw new Error(`integrity_check не прошёл: ${String(res)}`);
  }
  const out = join(config.BACKUP_DIR, `${kind}-${stamp}.sqlite.gz`);
  await pipeline(createReadStream(tmp), createGzip({ level: 9 }), createWriteStream(out));
  rmSync(tmp);
  // Картинки: просто зеркало каталога (имена уникальны, файлы не меняются).
  if (existsSync(config.MEDIA_DIR)) cpSync(config.MEDIA_DIR, join(config.BACKUP_DIR, 'media'), { recursive: true, force: false, errorOnExist: false });
  prune(config.BACKUP_DIR, `${kind}-`, KEEP[kind]);

  if (config.BACKUP_MIRROR) {
    try {
      mkdirSync(config.BACKUP_MIRROR, { recursive: true });
      cpSync(out, join(config.BACKUP_MIRROR, `${kind}-${stamp}.sqlite.gz`));
      if (existsSync(config.MEDIA_DIR)) cpSync(config.MEDIA_DIR, join(config.BACKUP_MIRROR, 'media'), { recursive: true, force: false, errorOnExist: false });
      prune(config.BACKUP_MIRROR, `${kind}-`, KEEP[kind]);
    } catch (err) {
      // Внешний диск отключён или нет доступа (TCC) — основной снимок всё равно сделан.
      log(`Зеркало ${config.BACKUP_MIRROR} недоступно: ${(err as Error).message}`);
    }
  }
  const bytes = statSync(out).size;
  const at = Date.now();
  mkdirSync(config.OPS_STATE_DIR, { recursive: true });
  writeFileSync(join(config.OPS_STATE_DIR, 'last-backup.json'), JSON.stringify({ at, file: out, bytes }));
  log(`Снимок: ${out} (${Math.round(bytes / 1024)} КБ), integrity_check ok`);
  return { file: out, bytes, at };
}

/** Снимки в каталоге: вид, время (из имени), размер; новые сверху. */
export function listBackups(): { name: string; kind: string; at: number; bytes: number }[] {
  try {
    return readdirSync(config.BACKUP_DIR)
      .filter((f) => /^(half|daily|manual)-\d{8}T\d{6}\.sqlite\.gz$/.test(f))
      .map((f) => {
        const [kind, stamp] = f.replace('.sqlite.gz', '').split('-') as [string, string];
        const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
        return { name: f, kind, at: Date.parse(iso), bytes: statSync(join(config.BACKUP_DIR, f)).size };
      })
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}
