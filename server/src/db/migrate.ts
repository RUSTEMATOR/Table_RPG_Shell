import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { MIGRATIONS_DIR } from '../paths.ts';
import { db, sqlite } from './client.ts';

migrate(db, { migrationsFolder: MIGRATIONS_DIR });
console.log(`Миграции применены (${MIGRATIONS_DIR})`);
sqlite.close();
