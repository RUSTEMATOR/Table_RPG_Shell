import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import webpush from 'web-push';
import { config } from '../config.ts';

// npm run vapid[:dev] — пара ключей VAPID для push-уведомлений (этап 41).
// Дописывает VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY в env-файл, если их там ещё нет. Ключи не печатает.

const file = config.envFile;
if (!existsSync(file)) {
  console.log(`Нет env-файла: ${file}. Сначала npm run setup.`);
  process.exit(1);
}
const text = readFileSync(file, 'utf8');
if (/^VAPID_PUBLIC_KEY=/m.test(text) || /^VAPID_PRIVATE_KEY=/m.test(text)) {
  console.log('Ключи VAPID уже есть — ничего не менял.');
  process.exit(0);
}
const keys = webpush.generateVAPIDKeys();
appendFileSync(file, `${text.endsWith('\n') || text === '' ? '' : '\n'}# Push-уведомления (этап 41)\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`);
console.log(`Ключи VAPID записаны в ${file}. Перезапустите сервер.`);
