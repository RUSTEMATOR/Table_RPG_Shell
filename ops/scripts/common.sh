# Общие переменные для скриптов ops. Подключается через source.
ZG_ROOT="${ZG_ROOT:-$HOME/srv/zelenogorye}"
ENV_FILE="${ZG_ENV_FILE:-$HOME/.config/zelenogorye/.env}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
NGINX_BIN="${NGINX_BIN:-$(command -v nginx || echo /opt/homebrew/bin/nginx)}"
STATE_DIR="$ZG_ROOT/data/ops-state"
HEALTH_URL="http://127.0.0.1:3000/api/healthz"

# Значение переменной из env-файла без вывода остальных строк (там ключи).
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

wait_health() {
  local i
  for i in $(seq 1 "${1:-30}"); do
    if curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}
