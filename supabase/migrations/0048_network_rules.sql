-- Network rules: security rules (HTTP Basic Auth) and redirect rules
-- These are project-scoped and managed per-tenant.

CREATE TABLE IF NOT EXISTS security_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  path          TEXT, -- nullable: blank = protect all routes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_rules_project
  ON security_rules (organization_id, project_id);

CREATE TABLE IF NOT EXISTS security_rule_credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_rule_id UUID NOT NULL REFERENCES security_rules(id) ON DELETE CASCADE,
  username        TEXT NOT NULL,
  password_hash   TEXT NOT NULL, -- bcrypt hash, never stored in plaintext
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_rule_credentials_rule
  ON security_rule_credentials (security_rule_id);

CREATE TABLE IF NOT EXISTS redirect_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_path       TEXT NOT NULL,
  to_path         TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'temporary' CHECK (type IN ('temporary', 'permanent')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redirect_rules_project
  ON redirect_rules (organization_id, project_id);
