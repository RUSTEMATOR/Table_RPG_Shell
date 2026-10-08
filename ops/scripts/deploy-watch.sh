#!/bin/bash
# Выкладка по ветке на GitHub (раз в минуту из launchd, com.zelenogorye.deploy-watch): если в ветке deploy новый
# коммит — забрать его в $ZG_ROOT/source и выложить обычным deploy.sh этого коммита. Ничего не ставит в систему,
# входящих подключений не нужно: Mac только читает публичный репозиторий.
# Неудачный коммит не повторяется каждую минуту: следующая попытка — при новом коммите (или удалить failed-sha).
# Вручную: bash ops/scripts/deploy-watch.sh   (ZG_REPO_URL, ZG_DEPLOY_BRANCH — чтобы сменить источник)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
source "$here/common.sh"
REPO_URL="${ZG_REPO_URL:-$(env_get DEPLOY_REPO_URL)}"
REPO_URL="${REPO_URL:-https://github.com/RUSTEMATOR/Table_RPG_Shell.git}"
BRANCH="${ZG_DEPLOY_BRANCH:-deploy}"
SRC="$ZG_ROOT/source"
LOCK="$STATE_DIR/deploy.lock"
mkdir -p "$STATE_DIR" "$ZG_ROOT/logs"

# Одна выкладка за раз; замок старше часа — остался от упавшего запуска.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then rmdir "$LOCK" && mkdir "$LOCK"; else exit 0; fi
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

sha="$(git ls-remote "$REPO_URL" "refs/heads/$BRANCH" 2>/dev/null | cut -f1)"
[ -n "$sha" ] || exit 0 # ветки ещё нет или нет сети — тихо до следующей минуты
[ "$sha" != "$(cat "$STATE_DIR/deployed-sha" 2>/dev/null || true)" ] || exit 0
[ "$sha" != "$(cat "$STATE_DIR/failed-sha" 2>/dev/null || true)" ] || exit 0

log "В $BRANCH новый коммит ${sha:0:7} — выкладываю"
if [ ! -d "$SRC/.git" ]; then git clone --quiet "$REPO_URL" "$SRC"; fi
git -C "$SRC" fetch --quiet origin "$BRANCH"
git -C "$SRC" checkout --quiet --force --detach "$sha"
git -C "$SRC" clean -fdq

if ZG_SOURCE="$SRC" bash "$SRC/ops/scripts/deploy.sh"; then
  echo "$sha" > "$STATE_DIR/deployed-sha"
  rm -f "$STATE_DIR/failed-sha"
  log "Выложен ${sha:0:7}"
else
  echo "$sha" > "$STATE_DIR/failed-sha"
  log "ОШИБКА: ${sha:0:7} не выложен, работает прежний релиз. Лог выше; повтор — новым коммитом в $BRANCH или rm $STATE_DIR/failed-sha"
  exit 1
fi
