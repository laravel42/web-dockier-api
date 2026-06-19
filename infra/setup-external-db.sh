#!/usr/bin/env bash
# Apply supabase/migrations to a remote Postgres database (Supabase, Neon, etc.).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '→ %s\n' "$*"
}

die() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}

if ! command -v supabase >/dev/null 2>&1; then
  die "Missing supabase CLI. Run: pnpm install"
fi

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
  log "Loaded .env"
fi

# Migration URL priority:
# 1. MIGRATE_URL (explicit, e.g. Supavisor session pooler for IPv4-only networks)
# 2. DIRECT_URL / DATABASE_URL when host is pooler.supabase.com (IPv4)
# 3. DATABASE_URL, then DIRECT_URL (direct db.*.supabase.co requires IPv6 on free tier)
DB_URL="${MIGRATE_URL:-}"

if [[ -z "$DB_URL" ]]; then
  for candidate in "${DIRECT_URL:-}" "${DATABASE_URL:-}"; do
    if [[ -n "$candidate" && "$candidate" == *"pooler.supabase.com"* ]]; then
      DB_URL="$candidate"
      break
    fi
  done
fi

if [[ -z "$DB_URL" ]]; then
  DB_URL="${DATABASE_URL:-${DIRECT_URL:-}}"
fi

if [[ -n "$DB_URL" ]]; then
  if [[ "$DB_URL" == *"db."*".supabase.co"* && "$DB_URL" != *"pooler.supabase.com"* ]]; then
    log "Applying migrations from supabase/migrations (direct connection — requires IPv6)"
  elif [[ -n "${MIGRATE_URL:-}" ]]; then
    log "Applying migrations from supabase/migrations via MIGRATE_URL"
  else
    log "Applying migrations from supabase/migrations via pooler URL"
  fi
  exec supabase db push --db-url "$DB_URL"
fi

if [[ -f "$ROOT_DIR/supabase/.temp/project-ref" ]] || [[ -f "$ROOT_DIR/supabase/.branches/_current_branch" ]]; then
  log "Applying migrations to linked Supabase project (pnpm db:link)"
  exec supabase db push
fi

die "Set MIGRATE_URL (Supavisor session pooler), DATABASE_URL, or DIRECT_URL in .env, or link a project with pnpm db:link before running pnpm db:migrate"
