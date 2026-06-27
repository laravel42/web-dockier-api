-- Domains and SSL certificates for project sites.
-- Project-scoped and managed per-tenant, similar to network_rules.

CREATE TABLE IF NOT EXISTS domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  redirect_www    BOOLEAN NOT NULL DEFAULT true,
  wildcard        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domains_project
  ON domains (organization_id, project_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domains_name_unique
  ON domains (organization_id, name);

CREATE TABLE IF NOT EXISTS ssl_certificates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain_id       UUID REFERENCES domains(id) ON DELETE SET NULL,
  type            TEXT NOT NULL DEFAULT 'lets_encrypt' CHECK (type IN ('lets_encrypt', 'custom', 'clone')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'failed')),
  domain_name     TEXT NOT NULL,
  expires_at      TIMESTAMPTZ,
  issued_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssl_certificates_project
  ON ssl_certificates (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_ssl_certificates_domain
  ON ssl_certificates (domain_id);
