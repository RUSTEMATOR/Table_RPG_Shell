#!/bin/bash
# Подготовка прод-окружения на Mac mini. Сам ничего не ставит в систему:
# собирает конфиги из шаблонов в $ZG_ROOT/etc и печатает команды с sudo, которые нужно выполнить руками.
# Запуск: DOMAIN=zg.example.com bash ops/scripts/install.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
: "${DOMAIN:?Укажите DOMAIN=zg.<домен>}"
[ -n "$NODE_BIN" ] || { echo "node не найден, задайте NODE_BIN"; exit 1; }
TLS_DIR="${TLS_DIR:-$HOME/.config/zelenogorye/tls}"
templates="$here/../templates"
out="$ZG_ROOT/etc"
mkdir -p "$out" "$ZG_ROOT"/{releases,data/ops-state,data/media,logs}

render() {
  sed -e "s|{{DOMAIN}}|$DOMAIN|g" -e "s|{{ZG_ROOT}}|$ZG_ROOT|g" -e "s|{{TLS_DIR}}|$TLS_DIR|g" \
      -e "s|{{USER}}|$(id -un)|g" -e "s|{{HOME}}|$HOME|g" -e "s|{{ENV_FILE}}|$ENV_FILE|g" \
      -e "s|{{NODE_BIN}}|$NODE_BIN|g" -e "s|{{NODE_DIR}}|$(dirname "$NODE_BIN")|g" -e "s|{{NGINX_BIN}}|$NGINX_BIN|g" "$1"
}
for f in "$templates"/*; do render "$f" > "$out/$(basename "$f")"; done
# Наблюдатель за веткой deploy живёт в etc (не в релизе): его не заменит выкладка, которую он сам запускает.
cp "$here/deploy-watch.sh" "$here/common.sh" "$out/"
for f in "$out"/*.plist; do plutil -lint "$f" >/dev/null; done

# Списки адресов Cloudflare нужны nginx до первого запуска.
[ -s "$STATE_DIR/cloudflare-allow.conf" ] || ZG_ROOT="$ZG_ROOT" NO_RELOAD=1 bash "$here/update-cf-ips.sh"

for f in origin.pem origin.key cloudflare-origin-pull-ca.pem; do
  [ -f "$TLS_DIR/$f" ] || echo "ВНИМАНИЕ: нет $TLS_DIR/$f"
done
[ -f "$ENV_FILE" ] || echo "ВНИМАНИЕ: нет $ENV_FILE (образец: ops/env.production.example)"

nginx_servers="$(dirname "$("$NGINX_BIN" -V 2>&1 | sed -n 's/.*--conf-path=\([^ ]*\).*/\1/p')")/servers"
cat <<MSG

Готово: конфиги в $out
Дальше руками (один раз):

  ln -sf "$out/zelenogorye.conf" "$nginx_servers/zelenogorye.conf"
  "$NGINX_BIN" -t
  brew services stop nginx 2>/dev/null || true

  sudo cp "$out"/com.zelenogorye.*.plist /Library/LaunchDaemons/
  sudo chown root:wheel /Library/LaunchDaemons/com.zelenogorye.*.plist
  sudo chmod 644 /Library/LaunchDaemons/com.zelenogorye.*.plist

Первый релиз и база: bash ops/scripts/deploy.sh, затем
  ZG_ENV_FILE="$ENV_FILE" "$NODE_BIN" "$ZG_ROOT/current/server/dist/setup.mjs"

Запуск служб:
  for s in server nginx backup backup-daily cfips logs deploy-watch; do sudo launchctl bootstrap system /Library/LaunchDaemons/com.zelenogorye.\$s.plist; done
  # DDNS — только если внешний IP не статический:
  sudo launchctl bootstrap system /Library/LaunchDaemons/com.zelenogorye.ddns.plist

Проверка: bash ops/scripts/status.sh
MSG
