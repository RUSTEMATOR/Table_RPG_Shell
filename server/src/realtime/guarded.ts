import type { Socket } from 'socket.io';
import { log } from './log.ts';

/**
 * Регистрирует обработчик так, что исключение внутри не роняет процесс:
 * пишем в лог и отвечаем ошибкой, если клиент ждёт ответа.
 */
export function on(socket: Socket, event: string, fn: (raw: unknown, ack: unknown) => void) {
  socket.on(event, (raw: unknown, ack: unknown) => {
    try {
      fn(raw, ack);
    } catch (err) {
      log().error({ err, event }, 'socket: ошибка обработчика');
      if (typeof ack === 'function') {
        try {
          (ack as (r: unknown) => void)({ ok: false, error: 'server_error' });
        } catch {}
      }
    }
  });
}
