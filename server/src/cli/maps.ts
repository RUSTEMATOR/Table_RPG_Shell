import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, schema, sqlite } from '../db/client.ts';
import { ensureMaps } from '../domain/maps.ts';
import { MIGRATIONS_DIR } from '../paths.ts';

// npm run maps:load — регионы и исходные места трёх карт (server/src/maps/json) в базу каждой комнаты.
// Повторный запуск ничего не дублирует и не трогает открытое, переименованное или удалённое мастером.
// Мастеру запускать необязательно: экран «Карты» сам догружает недостающее.

migrate(db, { migrationsFolder: MIGRATIONS_DIR });
const rooms = db.select().from(schema.room).all();
if (!rooms.length) throw new Error('Комнаты ещё нет: запустите npm run setup');
for (const r of rooms) console.log(`${r.name}: добавлено записей — ${ensureMaps(r.id)}`);
sqlite.close();
