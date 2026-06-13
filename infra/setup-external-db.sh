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

# Prefer direct connection for DDL; fall back to pooler URL or linked Supabase project.
DB_URL="${DIRECT_URL:-${DATABASE_URL:-}}"

if [[ -n "$DB_URL" ]]; then
  log "Applying migrations from supabase/migrations via DIRECT_URL/DATABASE_URL"
  exec supabase db push --db-url "$DB_URL"
fi

if [[ -f "$ROOT_DIR/supabase/.temp/project-ref" ]] || [[ -f "$ROOT_DIR/supabase/.branches/_current_branch" ]]; then
  log "Applying migrations to linked Supabase project (pnpm db:link)"
  exec supabase db push
fi

die "Set DIRECT_URL or DATABASE_URL in .env, or link a project with pnpm db:link before running pnpm db:migrate"
