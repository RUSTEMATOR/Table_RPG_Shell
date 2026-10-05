import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Корень пакета server: в dev это server/, в сборке — тоже server/ (dist лежит внутри).
function findServerRoot(from: string): string {
  let dir = from;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('server/package.json не найден');
    dir = parent;
  }
  return dir;
}

export const SERVER_ROOT = findServerRoot(import.meta.dirname);
export const MIGRATIONS_DIR = join(SERVER_ROOT, 'drizzle');
