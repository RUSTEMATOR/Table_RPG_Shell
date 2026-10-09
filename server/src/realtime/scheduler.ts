import { deliverDue } from '../domain/letters.ts';
import { revealDueRumors } from '../domain/places.ts';
import { remindDue } from '../domain/schedule.ts';
import { notifyPlaceChanged } from './maps.ts';

// Общий планировщик (этапы 42, 45, 46): при запуске и каждые 30 с — доставить письма, открыть слухи, напомнить об игре.
// Ошибки одного тика игру не останавливают.

const TICK_MS = 30_000;
let timer: ReturnType<typeof setInterval> | null = null;
type Log = { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };

export function startScheduler(log: Log): void {
  if (timer) return;
  const tick = () => {
    try {
      const n = deliverDue();
      if (n) log.info({ n }, 'letters: письма доставлены');
    } catch (err) {
      log.warn({ err }, 'letters: доставка не удалась');
    }
    try {
      const places = revealDueRumors();
      for (const p of places) notifyPlaceChanged(p.roomId, p.id);
      if (places.length) log.info({ n: places.length }, 'rumors: слухи открыты по расписанию');
    } catch (err) {
      log.warn({ err }, 'rumors: открытие по расписанию не удалось');
    }
    try {
      const n = remindDue();
      if (n) log.info({ n }, 'schedule: напоминания отправлены');
    } catch (err) {
      log.warn({ err }, 'schedule: напоминание не удалось');
    }
  };
  tick();
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
