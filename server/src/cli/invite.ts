import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { issueInvite } from '../auth/invites.ts';
import { newId } from '../auth/tokens.ts';
import { config } from '../config.ts';
import { db, schema, sqlite } from '../db/client.ts';
import { MIGRATIONS_DIR } from '../paths.ts';
import { arg } from './prompt.ts';

// npm run invite -- --name "Вася" [--role player|table]

migrate(db, { migrationsFolder: MIGRATIONS_DIR });

const name = arg('name');
const role = arg('role') ?? 'player';
if (!name || (role !== 'player' && role !== 'table')) {
  console.log('Использование: npm run invite -- --name "Имя" [--role player|table]');
  process.exit(1);
}
const room = db.select().from(schema.room).get();
if (!room) throw new Error('Комнаты ещё нет: запустите npm run setup');

const id = newId();
db.insert(schema.member).values({ id, roomId: room.id, role, name, createdAt: Date.now() }).run();
const { path, expiresAt } = issueInvite(id);
const base = config.PUBLIC_ORIGIN ?? 'http://<адрес>';
console.log(`Приглашение для «${name}» (${role}), действует до ${new Date(expiresAt).toLocaleString('ru-RU')}:`);
console.log(`${base}${path}`);
sqlite.close();
