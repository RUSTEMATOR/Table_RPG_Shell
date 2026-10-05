#!/bin/bash
# Закрытый QA-хост для ручной проверки снаружи. Сам ничего не ставит в систему и не трогает DNS, роутер, Cloudflare:
# собирает конфиг nginx, спрашивает пароль для входа и печатает команды, которые нужно выполнить руками.
# Запуск: QA_DOMAIN=qa-temple-of-serenity.<домен> bash ops/scripts/qa-setup.sh
# Требует, чтобы основной сайт уже был подготовлен install.sh (сертификаты, списки Cloudflare, default_server).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
: "${QA_DOMAIN:?Укажите QA_DOMAIN=qa-temple-of-serenity.<домен>}"
TLS_DIR="${TLS_DIR:-$HOME/.config/zelenogorye/tls}"
QA_HTPASSWD="${QA_HTPASSWD:-$HOME/.config/zelenogorye/qa.htpasswd}"
QA_USER="${QA_USER:-qa}"
out="$ZG_ROOT/etc"
mkdir -p "$out" "$ZG_ROOT/logs"

for f in origin.pem origin.key cloudflare-origin-pull-ca.pem; do
  [ -f "$TLS_DIR/$f" ] || echo "ВНИМАНИЕ: нет $TLS_DIR/$f (сначала docs/ops.md, раздел 1)"
done
[ -s "$STATE_DIR/cloudflare-allow.conf" ] || echo "ВНИМАНИЕ: нет списков Cloudflare, сначала install.sh"

# Пароль на входе: хэш в файле с правами 600, сам пароль нигде не печатается и не хранится.
if [ ! -f "$QA_HTPASSWD" ]; then
  mkdir -p "$(dirname "$QA_HTPASSWD")"
  read -r -s -p "Пароль для QA-входа (логин $QA_USER): " pw; echo
  [ "${#pw}" -ge 10 ] || { echo "Нужно не меньше 10 символов"; exit 1; }
  printf '%s:%s\n' "$QA_USER" "$(printf '%s' "$pw" | openssl passwd -apr1 -stdin)" > "$QA_HTPASSWD"
  chmod 600 "$QA_HTPASSWD"
  unset pw
else
  echo "Файл паролей уже есть: $QA_HTPASSWD (удалите его, чтобы задать новый)"
fi

sed -e "s|{{QA_DOMAIN}}|$QA_DOMAIN|g" -e "s|{{ZG_ROOT}}|$ZG_ROOT|g" -e "s|{{TLS_DIR}}|$TLS_DIR|g" \
    -e "s|{{QA_HTPASSWD}}|$QA_HTPASSWD|g" "$here/../templates/zelenogorye-qa.conf" > "$out/zelenogorye-qa.conf"

nginx_servers="$(dirname "$("$NGINX_BIN" -V 2>&1 | sed -n 's/.*--conf-path=\([^ ]*\).*/\1/p')")/servers"
cat <<MSG

Готово: $out/zelenogorye-qa.conf
Дальше руками:

1. Cloudflare, DNS: A-запись $QA_DOMAIN → тот же внешний IP, что у основного сайта, оранжевое облако (проксирование).
   Если сертификат origin выпущен только на zg.<домен>, перевыпустите его на *.<домен> и <домен> (SSL/TLS → Origin Server).
2. Подключить конфиг и проверить:
     ln -sf "$out/zelenogorye-qa.conf" "$nginx_servers/zelenogorye-qa.conf"
     "$NGINX_BIN" -t && "$NGINX_BIN" -s reload
3. Запустить dev с разрешением этого имени (иначе Vite ответит «Blocked request»):
     ZG_QA_HOST=$QA_DOMAIN npm run dev
4. Открыть https://$QA_DOMAIN с телефона по мобильной сети, логин $QA_USER и пароль из шага выше.
   Дальше обычный вход в игру (dev-данные: docs/dev-data.md).

Убрать хост: rm "$nginx_servers/zelenogorye-qa.conf"; nginx -s reload; удалить A-запись в Cloudflare.
MSG
