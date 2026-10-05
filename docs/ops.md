# Прод на Mac mini: пошагово для Рустема

Всё, что требует sudo, роутера или Cloudflare, делается руками по этому списку. Скрипты сами ничего в систему не ставят.

## 1. Сеть и Cloudflare (этап 0)

1. **Белый IP.** WAN-адрес на Huawei = адрес на 2ip.ua. Если WAN-адрес из 100.64–127.x, 10.x, 172.16–31.x, 192.168.x — это CGNAT, снаружи не достучаться: решать с провайдером.
2. **Статический ли IP** — спросить провайдера. Если нет — нужен DDNS (шаг 4.6).
3. **Двойной NAT:** если за Huawei стоит TP-Link, лучше Huawei в режим моста или Mac mini кабелем в Huawei.
4. **DHCP-резервация** адреса Mac mini, подключение кабелем.
5. **Проброс:** внешний TCP 443 → Mac:8443. Если провайдер режет 443 — внешний 8443 → Mac:8443 и в Cloudflare Origin Rules «порт назначения 8443».
6. **Cloudflare:**
   - домен, A-запись `zg.<домен>` → внешний IP, **оранжевое облако** (проксирование);
   - SSL/TLS → Full (strict); Always Use HTTPS; Network → WebSockets включены; Security → Bot Fight Mode выключен;
   - SSL/TLS → Origin Server → Create Certificate (15 лет) → сохранить как `~/.config/zelenogorye/tls/origin.pem` и `origin.key`;
   - SSL/TLS → Origin Server → Authenticated Origin Pulls → включить; CA Cloudflare для origin pull (`authenticated_origin_pull_ca.pem` из документации Cloudflare) сохранить как `~/.config/zelenogorye/tls/cloudflare-origin-pull-ca.pem`;
   - `chmod 600 ~/.config/zelenogorye/tls/*`.

## 2. Mac mini

1. Системные настройки → Конфиденциальность → FileVault → **выключить** (иначе после сбоя питания Mac ждёт пароль до загрузки системы).
2. `sudo pmset -a sleep 0 disksleep 0 autorestart 1`
3. Основные → Обновление ПО → Автоматически: выключить «Устанавливать обновления macOS».
4. Если в районе бывают отключения света — ИБП на Mac mini и роутеры.
5. Проект в проде живёт в `~/srv/zelenogorye` (не Desktop/Documents: туда launchd-службам нельзя без особых разрешений).

## 3. Секреты

```
cp ops/env.production.example ~/.config/zelenogorye/.env
chmod 600 ~/.config/zelenogorye/.env
```
Вписать домен, ключи (Jev — тот же, что в `.env.development`; Claude — из Console с месячным лимитом).

## 4. Установка (этап 1б)

1. `DOMAIN=zg.<домен> bash ops/scripts/install.sh` — соберёт конфиги в `~/srv/zelenogorye/etc`, скачает списки IP Cloudflare и напечатает команды.
2. Выполнить напечатанные команды: ссылка на конфиг nginx, `nginx -t`, копирование plist в `/Library/LaunchDaemons`.
3. `bash ops/scripts/deploy.sh` — первый релиз (берёт закоммиченный код из `~/Desktop/Zelenogorie`).
4. `ZG_ENV_FILE=~/.config/zelenogorye/.env node ~/srv/zelenogorye/current/server/dist/setup.mjs` — комната и пароль мастера для прода.
5. Запустить службы командой из вывода `install.sh` (`sudo launchctl bootstrap system …`).
6. DDNS (если IP не статический): токен Cloudflare `Zone.DNS:Edit` на одну зону, `CF_ZONE_ID`, `CF_RECORD_NAME` в `.env`, затем `bootstrap` для `com.zelenogorye.ddns`.
7. `bash ops/scripts/status.sh` — всё ли запущено.

Службы работают как LaunchDaemon от вашего пользователя: поднимаются после перезагрузки **без входа в систему**.

## 5. Повседневное (этап 7)

- **Выкладка:** закоммитить → `bash ops/scripts/deploy.sh`. Перерыв для игроков — несколько секунд: сервер перезапускается, клиенты переподключаются сами, при смене версии один раз перезагружаются.
- **Бэкапы:** каждые 30 минут, если за последние 3 часа была игра, и каждый день в 04:00. Лежат в `~/srv/zelenogorye/data/backups` (48 частых, 30 ежедневных) + картинки сцен. Зеркало — `BACKUP_MIRROR` в `.env` (внешний диск или iCloud Drive). Вручную: `ZG_ENV_FILE=~/.config/zelenogorye/.env node ~/srv/zelenogorye/current/server/dist/backup.mjs`.
  - Если зеркало на внешнем диске не пишется («Operation not permitted») — дать `node` (путь из `which node`) «Полный доступ к диску» в настройках конфиденциальности.
- **Восстановление:** `bash ops/scripts/restore.sh [файл]` (без файла — последний снимок). Остановит сервер (sudo), проверит снимок, положит текущую базу рядом с пометкой `before-restore`, поднимет сервер.
- **Логи:** `~/srv/zelenogorye/logs`, ротация каждую ночь, архивы 14 дней.
- **Состояние:** у мастера «Участники» → «Состояние»; или `bash ops/scripts/status.sh`.
- **Node из nvm:** путь к node зашит в plist. После обновления node через nvm заново выполнить `install.sh` и скопировать plist.
