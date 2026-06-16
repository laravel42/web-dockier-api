#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() {
  printf '→ %s\n' "$*"
}

die() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

load_publish_env() {
  local env_file="${PUBLISH_ENV_FILE:-$ROOT_DIR/.env}"
  if [[ -f "$env_file" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$env_file"
    set +a
    log "Loaded $env_file"
  fi
}

resolve_api_url() {
  local url="${DOCKIER_API_URL:-${VITE_API_BASE:-}}"
  [[ -n "$url" ]] || die "Set DOCKIER_API_URL (production backend URL) before publishing the frontend."
  printf '%s' "$url"
}

install_workspace_deps() {
  log "Installing workspace dependencies"
  (cd "$ROOT_DIR" && pnpm install)
  (cd "$ROOT_DIR/frontend" && pnpm install)
}

build_frontend() {
  local api_url="$1"
  log "Building frontend (VITE_API_BASE=$api_url)"
  (
    cd "$ROOT_DIR/frontend"
    VITE_API_BASE="$api_url" pnpm build
  )
}
