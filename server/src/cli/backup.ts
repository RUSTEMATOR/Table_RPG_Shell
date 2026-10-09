import { activeRecently, makeBackup } from '../ops/backup.ts';
import { flag } from './prompt.ts';

// npm run backup -- [--if-active] [--daily]
// Снимок базы (код — server/src/ops/backup.ts, им же пользуется страница мастера «База»).
// --if-active: только если за последние 3 часа была игра (броски). Хранение: 48 частых, 30 ежедневных.

if (flag('if-active') && !activeRecently()) {
  console.log('Игры не было последние 3 часа — снимок не нужен.');
} else {
  await makeBackup(flag('daily') ? 'daily' : 'half', (m) => console.log(m));
}
