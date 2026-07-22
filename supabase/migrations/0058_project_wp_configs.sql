-- Encrypted WordPress configuration (wp-config.php) per project.
-- Content is AES-256-GCM encrypted; only decryptable with the server-side ENV_ENCRYPTION_KEY.

CREATE TABLE IF NOT EXISTS project_wp_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  encrypted_content TEXT NOT NULL,
  iv              TEXT NOT NULL,
  auth_tag        TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_wp_configs_project
  ON project_wp_configs (organization_id, project_id);
