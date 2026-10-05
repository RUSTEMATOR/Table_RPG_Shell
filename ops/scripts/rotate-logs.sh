#!/bin/bash
# Раз в сутки: копия логов с датой + обнуление на месте (процессы пишут с O_APPEND, переоткрывать не нужно),
# сжатие, удаление архивов старше 14 дней.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
dir="$ZG_ROOT/logs"
day="$(date +%Y%m%d)"
for f in "$dir"/*.log; do
  [ -s "$f" ] || continue
  cp "$f" "$f.$day"
  : > "$f"
  gzip -f "$f.$day"
done
find "$dir" -name '*.log.*.gz' -mtime +14 -delete
log "Логи повёрнуты"
