#!/bin/bash
# Короткая сводка о состоянии прода.
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
echo "== Службы"
for s in server nginx backup backup-daily cfips ddns logs; do
  st="$(launchctl print "system/com.zelenogorye.$s" 2>/dev/null | awk -F'= ' '/^\tstate = /{print $2; exit}')"
  printf '  %-13s %s\n' "$s" "${st:-не загружена}"
done
echo "== Сервер"
curl -fsS --max-time 3 "$HEALTH_URL" && echo || echo "  healthz не отвечает"
echo "== nginx"
"$NGINX_BIN" -t 2>&1 | sed 's/^/  /'
echo "== Ключи (только наличие)"
for k in JEV_API_KEY ANTHROPIC_API_KEY CF_API_TOKEN; do
  [ -n "$(env_get "$k")" ] && echo "  $k задан" || echo "  $k нет"
done
echo "== Последний бэкап"
cat "$STATE_DIR/last-backup.json" 2>/dev/null || echo "  нет данных"; echo
echo "== Релиз"
readlink "$ZG_ROOT/current" 2>/dev/null || echo "  current не задан"
echo "== Диск"
df -h "$ZG_ROOT" | tail -1
