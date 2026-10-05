#!/bin/bash
# Закрытый QA-хост за Cloudflare Tunnel для ручной проверки снаружи (docs/ops.md, раздел 6).
# Кладёт конфиг в servers/ nginx (Homebrew, без sudo), задаёт пароль входа, проверяет и перезагружает nginx.
# DNS и туннель в Cloudflare не трогает: маршрут имени добавляется в панели, команда печатается в конце.
# Запуск: bash ops/scripts/qa-setup.sh            (имя по умолчанию ниже)
#         QA_DOMAIN=другое.имя bash ops/scripts/qa-setup.sh
#         bash ops/scripts/qa-setup.sh --remove   (убрать хост)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
QA_DOMAIN="${QA_DOMAIN:-qc-zelenogorye.qa-temple-of-serenity.cc}"
QA_USER="${QA_USER:-qa}"
nginx_conf_path="$("$NGINX_BIN" -V 2>&1 | sed -n 's/.*--conf-path=\([^ ]*\).*/\1/p')"
nginx_dir="$(dirname "$nginx_conf_path")"
QA_HTPASSWD="${QA_HTPASSWD:-$nginx_dir/.htpasswd-zelenogorye-qa}"
LOG_DIR="${LOG_DIR:-$(dirname "$(dirname "$nginx_dir")")/var/log/nginx}"
target="$nginx_dir/servers/zelenogorye-qa.conf"

if [ "${1:-}" = "--remove" ]; then
  rm -f "$target"
  "$NGINX_BIN" -t && "$NGINX_BIN" -s reload
  echo "Конфиг убран. Удалите маршрут $QA_DOMAIN в Cloudflare (Zero Trust → Networks → Tunnels → Public Hostname)."
  exit 0
fi

mkdir -p "$nginx_dir/servers" "$LOG_DIR"

# Пароль на входе: в файле только хэш (apr1), права 600. Пустой ввод — случайный пароль, печатается один раз.
if [ ! -f "$QA_HTPASSWD" ]; then
  pw=""
  if [ -t 0 ]; then
    read -r -s -p "Пароль для QA-входа (логин $QA_USER, от 10 символов, Enter — сгенерировать): " pw; echo
  fi
  if [ -z "$pw" ]; then
    pw="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
    echo "Пароль для QA-входа (логин $QA_USER): $pw"
    echo "Сохраните его сейчас: в файле лежит только хэш."
  fi
  [ "${#pw}" -ge 10 ] || { echo "Нужно не меньше 10 символов"; exit 1; }
  printf '%s:%s\n' "$QA_USER" "$(printf '%s' "$pw" | openssl passwd -apr1 -stdin)" > "$QA_HTPASSWD"
  chmod 600 "$QA_HTPASSWD"
  unset pw
else
  echo "Файл паролей уже есть: $QA_HTPASSWD (удалите его, чтобы задать новый)"
fi

sed -e "s|{{QA_DOMAIN}}|$QA_DOMAIN|g" -e "s|{{QA_HTPASSWD}}|$QA_HTPASSWD|g" -e "s|{{LOG_DIR}}|$LOG_DIR|g" \
    "$here/../templates/zelenogorye-qa.conf" > "$target"

if ! "$NGINX_BIN" -t; then
  rm -f "$target"
  echo "nginx -t не прошёл, конфиг убран, nginx не перезагружался."
  exit 1
fi
"$NGINX_BIN" -s reload

cat <<MSG

Готово: $target, nginx перезагружен.
Дальше:

1. Cloudflare → Zero Trust → Networks → Tunnels → туннель этого Mac → Public Hostname → Add:
     Subdomain/Domain: $QA_DOMAIN    Service: HTTP  localhost:8080
   DNS-запись Cloudflare создаст сам.
2. Запустить dev с разрешением этого имени (иначе Vite ответит «Blocked request»):
     ZG_QA_HOST=$QA_DOMAIN npm run dev
3. Открыть https://$QA_DOMAIN с телефона по мобильной сети, логин $QA_USER и пароль.
   Дальше обычный вход в игру (dev-данные: docs/dev-data.md).

Убрать хост: bash ops/scripts/qa-setup.sh --remove
MSG
