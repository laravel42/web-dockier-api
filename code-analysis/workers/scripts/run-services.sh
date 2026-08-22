#!/usr/bin/env bash
#
# Start every SAST service as its own process, then the router in front of them.
#
#   ./scripts/run-services.sh          start everything, tail the logs
#   ./scripts/run-services.sh stop     stop everything
#   ./scripts/run-services.sh status   what is up, and on which port
#
# Each service gets its own process so one engine wedging on a pathological
# repository cannot take the API down with it. Logs go to logs/<service>.log.

set -euo pipefail
cd "$(dirname "$0")/.."

REPO_ROOT="$(cd ../.. && pwd)"
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
  set +a
fi
if [ -f "$REPO_ROOT/.env.local" ] && [ "${NODE_ENV:-development}" != "production" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env.local"
  set +a
fi

PYTHON=${PYTHON:-./.venv/bin/python}
WORKERS=(gateway aggregator semgrep regex bearer codeql)
SERVICES=(api "${WORKERS[@]}")
RUN_DIR=.run
LOG_DIR=logs

port_for() {
  "$PYTHON" -c "from src.service_registry import BY_NAME, ROUTER_PORT; \
import sys; n=sys.argv[1]; print(ROUTER_PORT if n=='router' else BY_NAME[n].port)" "$1"
}

start_one() {
  local svc=$1
  if [ -f "$RUN_DIR/$svc.pid" ] && kill -0 "$(cat "$RUN_DIR/$svc.pid")" 2>/dev/null; then
    echo "  $svc already running (pid $(cat "$RUN_DIR/$svc.pid"))"
    return
  fi
  "$PYTHON" -m src.run "$svc" > "$LOG_DIR/$svc.log" 2>&1 &
  echo $! > "$RUN_DIR/$svc.pid"
  printf '  started %-11s :%s  (pid %s)\n' "$svc" "$(port_for "$svc")" "$!"
}

wait_for_api() {
  local port url
  port=$(port_for api)
  url="http://127.0.0.1:${port}/sast/health"
  for _ in $(seq 1 30); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "  api ready at :${port}"
      return 0
    fi
    sleep 1
  done
  echo "  warning: api did not respond at ${url} — check logs/api.log" >&2
  return 1
}

wait_for_service() {
  local svc=$1
  local port url
  port=$(port_for "$svc")
  url="http://127.0.0.1:${port}/health"
  for _ in $(seq 1 45); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "  ${svc} ready at :${port}"
      return 0
    fi
    sleep 1
  done
  echo "  warning: ${svc} did not respond at ${url} — check logs/${svc}.log" >&2
  return 1
}

start() {
  : "${DATABASE_URL:?DATABASE_URL is required}"
  : "${JWT_SECRET:?JWT_SECRET is required — the API fails closed without it}"

  if ! redis-cli ping >/dev/null 2>&1; then
    echo "  error: Redis is not reachable (aggregator barrier requires it)." >&2
    echo "  Start Redis locally, e.g. brew services start redis" >&2
    exit 1
  fi

  mkdir -p "$RUN_DIR" "$LOG_DIR"
  # API registers every queue on startup (~10s through Supavisor). Start it
  # before the router so /sast/* is not UPSTREAM_UNAVAILABLE during boot.
  start_one api
  wait_for_api || true
  for svc in "${WORKERS[@]}"; do
    start_one "$svc"
    # Queue registration hits Supavisor sequentially — starting every worker at
    # once can stall on pool limits and leave gateway stuck before it consumes
    # security-scan jobs.
    if [ "$svc" = "gateway" ]; then
      wait_for_service gateway || true
    else
      sleep 1
    fi
  done
  start_one router
  wait_for_service router || true
  echo
  echo "  router:  http://127.0.0.1:$(port_for router)"
  echo "  docs:    http://127.0.0.1:$(port_for router)/docs"
}

stop() {
  for svc in router "${SERVICES[@]}"; do
    pidfile="$RUN_DIR/$svc.pid"
    [ -f "$pidfile" ] || continue
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then kill "$pid" && echo "  stopped $svc (pid $pid)"; fi
    rm -f "$pidfile"
  done
  rm -f "$RUN_DIR"/*.pid
}

status() {
  for svc in router "${SERVICES[@]}"; do
    pidfile="$RUN_DIR/$svc.pid"
    if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
      printf '  %-11s up    :%s  (pid %s)\n' "$svc" "$(port_for "$svc")" "$(cat "$pidfile")"
    else
      printf '  %-11s down\n' "$svc"
    fi
  done
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "usage: $0 {start|stop|restart|status}" >&2; exit 2 ;;
esac
