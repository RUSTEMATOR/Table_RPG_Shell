import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { and, eq, ne } from 'drizzle-orm';
import { GmPasswordSchema } from '@zg/shared';
import { hashSecret } from '../auth/secrets.ts';
import { newId, newRoomCode } from '../auth/tokens.ts';
import { DEMO_CODE } from '../domain/demo.ts';
import { db, schema, sqlite } from '../db/client.ts';
import { MIGRATIONS_DIR } from '../paths.ts';
import { arg, ask, askHidden, flag } from './prompt.ts';

// npm run setup                         — создать комнату и мастера
// npm run setup -- --reset-gm-password  — сменить пароль мастера
// Без терминала: ZG_GM_PASSWORD=… npm run setup -- --room "…" --name "…"

migrate(db, { migrationsFolder: MIGRATIONS_DIR });

async function readPassword(): Promise<string> {
  // Без терминала (скрипты): пароль из ZG_GM_PASSWORD.
  const fromEnv = process.env.ZG_GM_PASSWORD;
  if (fromEnv !== undefined) {
    if (!GmPasswordSchema.safeParse(fromEnv).success) throw new Error('ZG_GM_PASSWORD: от 8 символов');
    return fromEnv;
  }
  for (;;) {
    const p1 = await askHidden('Пароль мастера (от 8 символов): ');
    if (!GmPasswordSchema.safeParse(p1).success) {
      console.log('Слишком короткий пароль.');
      continue;
    }
    const p2 = await askHidden('Ещё раз: ');
    if (p1 === p2) return p1;
    console.log('Пароли не совпали.');
  }
}

const existing = db.select().from(schema.room).where(ne(schema.room.code, DEMO_CODE)).get(); // демо-комната гостей — не наша

if (flag('reset-gm-password')) {
  if (!existing) throw new Error('Комнаты ещё нет: запустите npm run setup');
  const gm = db
    .select()
    .from(schema.member)
    .where(and(eq(schema.member.roomId, existing.id), eq(schema.member.role, 'gm')))
    .get();
  if (!gm) throw new Error('Мастер не найден');
  const secretHash = await hashSecret(await readPassword());
  db.update(schema.member).set({ secretHash }).where(eq(schema.member.id, gm.id)).run();
  db.delete(schema.authSession).where(eq(schema.authSession.memberId, gm.id)).run();
  console.log('Пароль мастера изменён, старые сессии мастера закрыты.');
} else if (existing) {
  console.log(`Комната уже есть: «${existing.name}», код ${existing.code}. Новую не создаю.`);
} else {
  const roomName = arg('room') ?? ((await ask('Название комнаты [Зеленогорье]: ')) || 'Зеленогорье');
  const gmName = arg('name') ?? ((await ask('Имя мастера [Мастер]: ')) || 'Мастер');
  const secretHash = await hashSecret(await readPassword());
  const now = Date.now();
  const roomId = newId();
  const code = newRoomCode();
  db.transaction((tx) => {
    tx.insert(schema.room).values({ id: roomId, code, name: roomName, createdAt: now }).run();
    tx.insert(schema.member)
      .values({ id: newId(), roomId, role: 'gm', name: gmName, secretHash, createdAt: now })
      .run();
  });
  console.log(`Готово. Комната «${roomName}», код ${code}. Вход мастера: код комнаты, «${gmName}», пароль.`);
}

sqlite.close();
