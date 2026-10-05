import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import Database from 'better-sqlite3';
import { config } from '../config.ts';
import { flag } from './prompt.ts';

// npm run backup -- [--if-active] [--daily]
// Снимок базы через SQLite backup API (безопасно при работающем сервере), integrity_check, gzip,
// копия картинок сцен. --if-active: только если за последние 3 часа была игра (броски).
// Хранение: 48 частых снимков и 30 ежедневных. BACKUP_MIRROR — второй каталог (внешний диск, iCloud Drive).

const KEEP = { half: 48, daily: 30 };
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const kind = flag('daily') ? 'daily' : 'half';

function activeRecently(): boolean {
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

async function main() {
  if (!existsSync(config.DB_PATH)) throw new Error(`Нет базы: ${config.DB_PATH}`);
  if (flag('if-active') && !activeRecently()) {
    console.log('Игры не было последние 3 часа — снимок не нужен.');
    return;
  }
  mkdirSync(config.BACKUP_DIR, { recursive: true });
  const tmp = join(config.BACKUP_DIR, `.tmp-${stamp}.sqlite`);
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
  // Картинки сцен: просто зеркало каталога (имена уникальны, файлы не меняются).
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
      console.error(`Зеркало ${config.BACKUP_MIRROR} недоступно: ${(err as Error).message}`);
    }
  }
  mkdirSync(config.OPS_STATE_DIR, { recursive: true });
  writeFileSync(join(config.OPS_STATE_DIR, 'last-backup.json'), JSON.stringify({ at: Date.now(), file: out, bytes: statSync(out).size }));
  console.log(`Снимок: ${out} (${Math.round(statSync(out).size / 1024)} КБ), integrity_check ok`);
}

await main();
