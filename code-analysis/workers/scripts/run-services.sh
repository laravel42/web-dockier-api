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

PYTHON=${PYTHON:-./.venv/bin/python}
SERVICES=(api gateway aggregator semgrep regex sonarqube codeql)
RUN_DIR=.run
LOG_DIR=logs

port_for() {
  "$PYTHON" -c "from src.service_registry import BY_NAME, ROUTER_PORT; \
import sys; n=sys.argv[1]; print(ROUTER_PORT if n=='router' else BY_NAME[n].port)" "$1"
}

start() {
  : "${DATABASE_URL:?DATABASE_URL is required}"
  : "${JWT_SECRET:?JWT_SECRET is required — the API fails closed without it}"

  mkdir -p "$RUN_DIR" "$LOG_DIR"
  for svc in "${SERVICES[@]}" router; do
    if [ -f "$RUN_DIR/$svc.pid" ] && kill -0 "$(cat "$RUN_DIR/$svc.pid")" 2>/dev/null; then
      echo "  $svc already running (pid $(cat "$RUN_DIR/$svc.pid"))"
      continue
    fi
    "$PYTHON" -m src.run "$svc" > "$LOG_DIR/$svc.log" 2>&1 &
    echo $! > "$RUN_DIR/$svc.pid"
    printf '  started %-11s :%s  (pid %s)\n' "$svc" "$(port_for "$svc")" "$!"
  done
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
