-- Dokploy integration mapping tables.
-- These track the relationship between Dockier entities and their Dokploy counterparts.

-- Map each organization (tenant) to a Dokploy Project.
-- One organization = one Dokploy Project.
CREATE TABLE IF NOT EXISTS dokploy_tenant_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dokploy_project_id TEXT NOT NULL,
  dokploy_environment_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id)
);

-- Map each Dockier project to a Dokploy Remote Server.
-- One project = one server (reused across redeployments).
CREATE TABLE IF NOT EXISTS dokploy_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  dokploy_server_id TEXT NOT NULL,
  server_ip TEXT NOT NULL,
  instance_id TEXT,
  server_status TEXT NOT NULL DEFAULT 'provisioning',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_dokploy_servers_status ON dokploy_servers(server_status);

-- Map each Dockier project to a Dokploy Application.
-- One project = one application (reused across redeployments).
CREATE TABLE IF NOT EXISTS dokploy_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dokploy_application_id TEXT NOT NULL,
  dokploy_server_id TEXT,
  build_type TEXT NOT NULL DEFAULT 'nixpacks',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id)
);
