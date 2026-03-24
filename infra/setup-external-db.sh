#!/bin/bash
# Setup script for external PostgreSQL
# Creates all 9 databases required by the Encore services
#
# Usage:
#   export DATABASE_URL="postgres://user:pass@host:5432/postgres?sslmode=require"
#   bash infra/setup-external-db.sh
#
# The DATABASE_URL should point to the default "postgres" database
# so we can CREATE DATABASE for each service.

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is required"
  echo "Example: export DATABASE_URL=\"postgres://user:pass@host:5432/postgres?sslmode=require\""
  exit 1
fi

DATABASES=(
  auth
  users
  deploy
  gitintegration
  projects
  notifications
  roles
  imagebuilder
  codeanalysis
)

echo "Creating databases on external PostgreSQL..."

for dbname in "${DATABASES[@]}"; do
  echo "  Creating database: $dbname"
  psql "$DATABASE_URL" -c "CREATE DATABASE $dbname;" 2>/dev/null || echo "    (already exists)"
done

echo ""
echo "All databases created. Now run migrations for each service."
echo ""
echo "To apply migrations, extract the host/user/pass from your DATABASE_URL"
echo "and run each migration file against the corresponding database:"
echo ""

# Map service directories to database names
declare -A SERVICE_MAP=(
  [auth]=auth
  [users]=users
  [deploy]=deploy
  [git-integration]=gitintegration
  [projects]=projects
  [notifications]=notifications
  [roles]=roles
  [image-builder]=imagebuilder
  [code-analysis]=codeanalysis
)

# Extract connection parts from DATABASE_URL for per-db connections
# Parse: postgres://user:pass@host:port/dbname?params
PROTO="${DATABASE_URL%%://*}"
REST="${DATABASE_URL#*://}"
USERPASS="${REST%%@*}"
HOSTPORTDB="${REST#*@}"
HOSTPORT="${HOSTPORTDB%%/*}"
PARAMS=""
if [[ "$HOSTPORTDB" == *"?"* ]]; then
  PARAMS="?${HOSTPORTDB#*?}"
fi

for service_dir in "${!SERVICE_MAP[@]}"; do
  dbname="${SERVICE_MAP[$service_dir]}"
  migration_dir="$service_dir/migrations"

  if [ -d "$migration_dir" ]; then
    DB_URL="${PROTO}://${USERPASS}@${HOSTPORT}/${dbname}${PARAMS}"
    echo "Running migrations for $dbname..."
    for migration in "$migration_dir"/*.up.sql; do
      echo "  Applying: $(basename "$migration")"
      psql "$DB_URL" -f "$migration" 2>&1 | sed 's/^/    /'
    done
  fi
done

echo ""
echo "Done! All databases created and migrations applied."
echo ""
echo "Next steps:"
echo "  1. Set environment variables: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD"
echo "  2. Run with: encore run --infra-config=infra/infra.config.json"
