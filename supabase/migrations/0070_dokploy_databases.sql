-- Dokploy self-hosted database services.
-- Tracks databases (mysql/postgres/redis/...) provisioned on a project's
-- Dokploy server for `mode: "vps"` services. Managed-mode services are NOT
-- stored here — the app reaches those via its own env credentials.
--
-- A project may have more than one backing service (e.g. a SQL database AND a
-- redis cache), so the row is keyed on (project_id, service_type) rather than
-- project_id alone.

CREATE TABLE IF NOT EXISTS dokploy_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Service category: "database" (SQL) or "cache" (redis), matching the
  -- DeployService.type values from the deploy request.
  service_type TEXT NOT NULL,
  -- Engine actually provisioned: "mysql" | "postgres" | "redis".
  engine TEXT NOT NULL,
  -- Dokploy's id for the service (mysqlId/postgresId/redisId).
  dokploy_database_id TEXT NOT NULL,
  -- Internal Docker service hostname other containers use to reach it
  -- (the value injected as DB_HOST / REDIS_HOST).
  db_host TEXT NOT NULL,
  db_name TEXT,
  db_user TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, service_type)
);

CREATE INDEX IF NOT EXISTS idx_dokploy_databases_project ON dokploy_databases(project_id);
