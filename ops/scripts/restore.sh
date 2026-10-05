#!/bin/bash
# Восстановление базы из снимка. Сервер на время останавливается (нужен sudo для launchctl).
# Запуск: bash ops/scripts/restore.sh <файл .sqlite.gz>   (без аргумента — последний снимок)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
db="$(env_get DB_PATH)"
[ -n "$db" ] || { echo "DB_PATH не найден в $ENV_FILE"; exit 1; }
backups="$(env_get BACKUP_DIR)"; backups="${backups:-$(dirname "$db")/backups}"
src="${1:-$(ls -1t "$backups"/*.sqlite.gz 2>/dev/null | head -1)}"
[ -f "$src" ] || { echo "Нет снимка: $src"; exit 1; }
log "Восстановление из $src"

tmp="$db.restore-tmp"
gunzip -c "$src" > "$tmp"
[ "$(sqlite3 "$tmp" 'pragma integrity_check;')" = "ok" ] || { rm -f "$tmp"; echo "Снимок повреждён"; exit 1; }

plist=/Library/LaunchDaemons/com.zelenogorye.server.plist
sudo launchctl bootout system/com.zelenogorye.server 2>/dev/null || true
sleep 1
[ -f "$db" ] && cp "$db" "$db.before-restore-$(date +%Y%m%d-%H%M%S)"
rm -f "$db-wal" "$db-shm"
mv "$tmp" "$db"
media="$(dirname "$db")/media"
[ -d "$backups/media" ] && rsync -a "$backups/media/" "$media/"
sudo launchctl bootstrap system "$plist"
if wait_health 30; then log "Готово, сервер отвечает"; else log "ОШИБКА: сервер не поднялся, смотрите логи"; exit 1; fi
