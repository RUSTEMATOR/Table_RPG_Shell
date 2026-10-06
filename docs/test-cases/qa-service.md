# QA-хост: служба dev

Подготовка: выполнен `bash ops/scripts/qa-setup.sh`, маршрут `qc-zelenogorye` в Cloudflare Tunnel добавлен.

| # | Действие | Ожидается |
|---|---|---|
| Q.1 | `launchctl print gui/$(id -u)/com.zelenogorye.qa-dev \| grep state` | `state = running`. |
| Q.2 | С телефона по мобильной сети открыть `https://qc-zelenogorye.qa-temple-of-serenity.cc`. | Страница входа, без 502 и без «Blocked request». |
| Q.3 | `pkill -f scripts/dev.mjs`, подождать 15 с, обновить страницу на телефоне. | Через несколько секунд хост снова отвечает: служба перезапустилась сама. |
| Q.4 | Перезагрузить Mac, ничего не запускать руками, через 1–2 минуты открыть адрес с телефона. | Хост отвечает. |
| Q.5 | `bash ops/scripts/qa-setup.sh --remove`, затем открыть адрес. | 502 (или ошибка туннеля); `~/Library/LaunchAgents/com.zelenogorye.qa-dev.plist` нет. Вернуть: `bash ops/scripts/qa-setup.sh`. |
