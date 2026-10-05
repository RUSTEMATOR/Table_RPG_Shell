#!/bin/bash
# Выкладка: новый релиз из закоммиченного кода → сборка → бэкап → миграции → атомарная смена current
# → перезапуск сервера (launchd поднимает его сам) → проверка → nginx reload → уборка старых релизов.
# Запуск: bash ops/scripts/deploy.sh   (ZG_SOURCE — путь к репозиторию, по умолчанию ~/Desktop/Zelenogorie)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
SOURCE="${ZG_SOURCE:-$HOME/Desktop/Zelenogorie}"
KEEP=3
[ -n "$NODE_BIN" ] || { echo "node не найден, задайте NODE_BIN"; exit 1; }
export ZG_ENV_FILE="$ENV_FILE"

ts="$(date +%Y%m%d-%H%M%S)"
rel="$ZG_ROOT/releases/$ts"
mkdir -p "$ZG_ROOT/releases" "$ZG_ROOT/logs"
log "Релиз $ts из $SOURCE ($(git -C "$SOURCE" rev-parse --short HEAD))"
if [ -n "$(git -C "$SOURCE" status --porcelain)" ]; then log "Внимание: в $SOURCE есть незакоммиченные правки — в релиз они не попадут."; fi
git clone --quiet --depth 1 "file://$SOURCE" "$rel"
cd "$rel"
npm ci --no-audit --no-fund --loglevel=error
npm run build --silent

db="$(env_get DB_PATH)"
if [ -n "$db" ] && [ -f "$db" ]; then
  log "Бэкап перед миграцией"
  "$NODE_BIN" server/dist/backup.mjs
fi
log "Миграции"
"$NODE_BIN" server/dist/migrate.mjs

# Атомарная смена: временная ссылка и mv -h поверх старой.
ln -sfn "$rel" "$ZG_ROOT/current.new"
mv -fh "$ZG_ROOT/current.new" "$ZG_ROOT/current"
log "current → $rel"

# Сервер завершается по SIGTERM, launchd (KeepAlive) запускает его уже из нового current.
if pkill -TERM -f "$ZG_ROOT/current/server/dist/index.mjs"; then
  sleep 1
  if wait_health 20; then log "Сервер отвечает"; else log "ОШИБКА: сервер не ответил за 20 с — смотрите $ZG_ROOT/logs/server.err.log"; exit 1; fi
else
  log "Сервер не был запущен (первая выкладка?) — запустите службу launchd."
fi

if "$NGINX_BIN" -t 2>/dev/null; then "$NGINX_BIN" -s reload 2>/dev/null || true; fi

# Оставляем KEEP последних релизов, текущий не трогаем (head -n -N в macOS нет).
cur="$(readlink "$ZG_ROOT/current")"
releases=()
while IFS= read -r d; do releases+=("$d"); done < <(ls -1d "$ZG_ROOT"/releases/*/ 2>/dev/null | sed 's|/$||' | sort)
for ((i = 0; i < ${#releases[@]} - KEEP; i++)); do
  [ "${releases[$i]}" = "$cur" ] || rm -rf "${releases[$i]}"
done
log "Готово"
