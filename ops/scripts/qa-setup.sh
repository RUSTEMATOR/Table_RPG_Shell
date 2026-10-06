#!/bin/bash
# Закрытый QA-хост за Cloudflare Tunnel для ручной проверки снаружи (docs/ops.md, раздел 6).
# Кладёт конфиг в servers/ nginx (Homebrew, без sudo), проверяет и перезагружает nginx. Пароля на входе нет.
# Ставит службу пользователя (LaunchAgent, как у qc-intercom) с `npm run dev` для этого имени: поднимается при входе
# в систему (вход автоматический — значит, после перезагрузки) и перезапускается, если упала.
# DNS и туннель в Cloudflare не трогает: маршрут имени добавляется в панели, команда печатается в конце.
# Запуск: bash ops/scripts/qa-setup.sh            (имя по умолчанию ниже)
#         QA_DOMAIN=другое.имя bash ops/scripts/qa-setup.sh
#         bash ops/scripts/qa-setup.sh --remove   (убрать хост)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
QA_DOMAIN="${QA_DOMAIN:-qc-zelenogorye.qa-temple-of-serenity.cc}"
nginx_conf_path="$("$NGINX_BIN" -V 2>&1 | sed -n 's/.*--conf-path=\([^ ]*\).*/\1/p')"
nginx_dir="$(dirname "$nginx_conf_path")"
LOG_DIR="${LOG_DIR:-$(dirname "$(dirname "$nginx_dir")")/var/log/nginx}"
target="$nginx_dir/servers/zelenogorye-qa.conf"
REPO="$(cd "$here/../.." && pwd)"
AGENT_LABEL="com.zelenogorye.qa-dev"
agent="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"
domain="gui/$(id -u)"

if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "$domain/$AGENT_LABEL" 2>/dev/null || true
  rm -f "$agent" "$target"
  "$NGINX_BIN" -t && "$NGINX_BIN" -s reload
  echo "Конфиг и служба dev убраны. Удалите маршрут $QA_DOMAIN в Cloudflare (Zero Trust → Networks → Tunnels → Public Hostname)."
  exit 0
fi

mkdir -p "$nginx_dir/servers" "$LOG_DIR"

sed -e "s|{{QA_DOMAIN}}|$QA_DOMAIN|g" -e "s|{{LOG_DIR}}|$LOG_DIR|g" \
    "$here/../templates/zelenogorye-qa.conf" > "$target"

if ! "$NGINX_BIN" -t; then
  rm -f "$target"
  echo "nginx -t не прошёл, конфиг убран, nginx не перезагружался."
  exit 1
fi
"$NGINX_BIN" -s reload

[ -n "$NODE_BIN" ] || { echo "node не найден, задайте NODE_BIN"; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$agent" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$AGENT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>scripts/dev.mjs</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ZG_QA_HOST</key><string>$QA_DOMAIN</string>
    <key>PATH</key><string>$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/zelenogorye-qa-dev.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/zelenogorye-qa-dev.err</string>
</dict>
</plist>
PLIST
plutil -lint "$agent" >/dev/null
launchctl bootout "$domain/$AGENT_LABEL" 2>/dev/null || true
launchctl bootstrap "$domain" "$agent"

cat <<MSG

Готово: $target, nginx перезагружен.
Служба dev: $agent (запущена; логи — ~/Library/Logs/zelenogorye-qa-dev.log и .err).
Перезапуск после правок в .env или зависимостях: launchctl kickstart -k $domain/$AGENT_LABEL
Дальше:

1. Cloudflare → Zero Trust → Networks → Tunnels → туннель этого Mac → Public Hostname → Add:
     Subdomain/Domain: $QA_DOMAIN    Service: HTTP  localhost:8080
   DNS-запись Cloudflare создаст сам.
2. Открыть https://$QA_DOMAIN с телефона по мобильной сети, обычный вход в игру (dev-данные: docs/dev-data.md).

Убрать хост: bash ops/scripts/qa-setup.sh --remove
MSG
