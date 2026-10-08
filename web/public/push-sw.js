/* Push-уведомления (этап 41). Подключается к сгенерированному сервис-воркеру через workbox.importScripts.
   Тело уведомления приходит с сервера уже без свободного текста (см. server/src/push/send.ts). */

self.addEventListener('push', (event) => {
  let note = null;
  try {
    note = event.data ? event.data.json() : null;
  } catch {
    note = null;
  }
  if (!note || typeof note.title !== 'string') return;
  event.waitUntil(
    (async () => {
      // Приложение открыто и на экране — событие уже пришло по сокету, уведомление только мешало бы.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins.some((w) => w.visibilityState === 'visible')) return;
      await self.registration.showNotification(note.title, {
        body: typeof note.body === 'string' ? note.body : '',
        tag: typeof note.tag === 'string' ? note.tag : 'zg',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: typeof note.url === 'string' ? note.url : '/' },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const target = new URL(url, self.location.origin).href;
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins.find((w) => 'focus' in w);
      if (win) {
        await win.focus();
        // открытое приложение само перейдёт куда нужно (lib/push.ts слушает сообщения)
        win.postMessage({ type: 'zg:open', url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
