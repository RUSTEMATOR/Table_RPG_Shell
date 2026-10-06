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
- **Сжатие и модели карты:** шаблон nginx (`ops/templates/zelenogorye.conf`) сжимает JSON, `.glb` и SVG и отдаёт `/models/*.glb` с типом `model/gltf-binary` и кэшем на неделю (версия файла — в `?v=`). После обновления шаблона — заново `install.sh` (пересоберёт конфиг) и `nginx -t` + перезагрузка nginx.
- **Node из nvm:** путь к node зашит в plist. После обновления node через nvm заново выполнить `install.sh` и скопировать plist.

## 6. Закрытый QA-хост для ручной проверки снаружи

`https://qc-zelenogorye.qa-temple-of-serenity.cc` на этом Mac: Cloudflare Tunnel (`cloudflared`, тот же туннель, что у qc-intercom) → nginx Homebrew :8080 → Vite 5173 → dev-сервер 3001, dev-база. Роутер, сертификаты и этап 0 не нужны.

Пароля на входе нет (решение Рустема): dev-базу с известными PIN-ами откроет любой, кто знает имя, поэтому имя никому лишнему не давать, а настоящие данные в dev не держать. Что ещё прикрывает хост: снаружи только через туннель (нет открытых портов и IP в DNS); nginx пускает к этому имени только соединения с самого Mac, из локальной сети напрямую — 403; `noindex`; отдельные логи `zelenogorye-qa-*.log` в `/opt/homebrew/var/log/nginx`.

**Гостевой вход для проверки интерфейса.** На странице входа (только в dev, `NODE_ENV=development`, — значит, и на этом хосте) есть «Посмотреть без входа»: «Мастер», «Игрок», «Стол». Гость попадает в отдельную «Демо-комнату» (код `DEMO26`, создаётся и наполняется тестовыми данными при первом входе) — рабочую dev-комнату он не видит: все запросы и события ограничены комнатой сессии. У гостевых участников нет PIN, войти в демо-комнату по коду нельзя. В демо-комнате выключены Jev и Claude (платные вызовы) и скрыто «Состояние» сервера. Гостю-столу показывается «Выйти», чтобы сменить роль. В проде маршрут `/api/auth/guest` отвечает 404. Сбросить демо-комнату: остановить dev, удалить комнату `DEMO26` из dev-базы (каскадно уходит всё её содержимое) — при следующем гостевом входе она создастся заново.

1. `bash ops/scripts/qa-setup.sh` — кладёт `servers/zelenogorye-qa.conf`, `nginx -t`, reload и ставит службу dev (см. ниже). Другое имя: `QA_DOMAIN=… bash ops/scripts/qa-setup.sh`.
2. Cloudflare → Zero Trust → Networks → Tunnels → туннель этого Mac → Public Hostname → Add: имя `qc-zelenogorye`, домен `qa-temple-of-serenity.cc`, Service `HTTP` `localhost:8080`. DNS-запись появится сама.
3. С телефона по мобильной сети открыть адрес, обычный вход (docs/dev-data.md).

**Служба dev** — как у qc-intercom: служба пользователя `~/Library/LaunchAgents/com.zelenogorye.qa-dev.plist`, без sudo. Запускает `npm run dev` (через `node scripts/dev.mjs`) из этой папки с `ZG_QA_HOST`; поднимается при входе в систему — вход на этом Mac автоматический, значит, и после перезагрузки; упала — перезапускается через 10 с. Логи — `~/Library/Logs/zelenogorye-qa-dev.log` и `.err`.
- Перезапуск (после правок `.env.development`, `npm install`, смены ветки): `launchctl kickstart -k gui/$(id -u)/com.zelenogorye.qa-dev`. Правки кода подхватываются сами (как в обычном `npm run dev`).
- Остановить на время: `launchctl bootout gui/$(id -u)/com.zelenogorye.qa-dev`; вернуть: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.zelenogorye.qa-dev.plist`.
- Пока служба работает, второй `npm run dev` в терминале не запустится (порты 3001 и 5173 заняты) — сначала остановить службу.
- Node из nvm: путь к node зашит в службу. После обновления node — заново `bash ops/scripts/qa-setup.sh`.

Убрать: `bash ops/scripts/qa-setup.sh --remove` (конфиг nginx и служба) и удалить Public Hostname в Cloudflare. Пока служба не работает, хост отвечает 502.
