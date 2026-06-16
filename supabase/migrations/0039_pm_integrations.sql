CREATE TABLE IF NOT EXISTS pm_integrations (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    credentials_encrypted TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_integrations_org ON pm_integrations(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_integrations_org_provider ON pm_integrations(organization_id, provider);

ALTER TABLE pm_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view pm integrations in their org" ON pm_integrations;
CREATE POLICY "Members can view pm integrations in their org"
  ON pm_integrations FOR SELECT
  TO authenticated
  USING (is_member_of_text(organization_id));
