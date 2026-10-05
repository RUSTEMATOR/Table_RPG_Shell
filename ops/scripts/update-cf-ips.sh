#!/bin/bash
# Раз в неделю: свежие диапазоны IP Cloudflare → allow-список и set_real_ip_from для nginx.
# При ошибке старые файлы остаются, nginx не перезагружается.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
mkdir -p "$STATE_DIR"
v4="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)"
v6="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)"
ranges="$(printf '%s\n%s\n' "$v4" "$v6" | grep -E '^[0-9a-fA-F:.]+/[0-9]+$' || true)"
n="$(printf '%s\n' "$ranges" | grep -c . || true)"
[ "$n" -ge 10 ] || { log "Подозрительно мало диапазонов ($n) — ничего не меняю"; exit 1; }

allow="$STATE_DIR/cloudflare-allow.conf"; realip="$STATE_DIR/cloudflare-realip.conf"
{ echo "# Обновлено $(date '+%Y-%m-%d %H:%M')"; printf '%s\n' "$ranges" | sed 's/^/allow /; s/$/;/'; } > "$allow.new"
{ echo "# Обновлено $(date '+%Y-%m-%d %H:%M')"; printf '%s\n' "$ranges" | sed 's/^/set_real_ip_from /; s/$/;/'; } > "$realip.new"
[ -f "$allow" ] && cp "$allow" "$allow.prev"; [ -f "$realip" ] && cp "$realip" "$realip.prev"
mv "$allow.new" "$allow"; mv "$realip.new" "$realip"

if [ -n "${NO_RELOAD:-}" ]; then log "Списки Cloudflare записаны ($n диапазонов)"; exit 0; fi
if "$NGINX_BIN" -t 2>/dev/null; then
  "$NGINX_BIN" -s reload
  log "Списки Cloudflare обновлены ($n диапазонов), nginx перезагружен"
else
  [ -f "$allow.prev" ] && mv "$allow.prev" "$allow"; [ -f "$realip.prev" ] && mv "$realip.prev" "$realip"
  log "nginx -t не прошёл — вернул прежние списки"; exit 1
fi
