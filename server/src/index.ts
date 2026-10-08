import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { buildApp } from './app.ts';
import { BUILD_ID, config } from './config.ts';
import { db, sqlite } from './db/client.ts';
import { backfillMedia } from './domain/media.ts';
import { MIGRATIONS_DIR } from './paths.ts';
import { attachSocketIo } from './realtime/io.ts';

if (config.isDev) migrate(db, { migrationsFolder: MIGRATIONS_DIR });

const app = await buildApp();
const io = attachSocketIo(app);
await app.listen({ host: config.HOST, port: config.PORT });
app.log.info({ build: BUILD_ID, env: config.NODE_ENV }, 'Зеленогорье запущено');
void backfillMedia(app.log);

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    if (closing) return;
    closing = true;
    app.log.info({ sig }, 'остановка');
    io.disconnectSockets(true);
    await app.close();
    sqlite.close();
    process.exit(0);
  });
}
