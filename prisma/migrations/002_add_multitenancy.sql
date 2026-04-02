-- ============================================================
-- Multi-tenancy: create apps table and add app_id to all tables
-- ============================================================

-- 1. Create apps table
CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 2. Add app_id (NOT NULL, no default — must be set explicitly) to all tables

ALTER TABLE users ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_app ON users(app_id);

ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_connections_app ON social_connections(app_id);

ALTER TABLE roles ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_app ON roles(app_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_app ON projects(app_id);

ALTER TABLE git_connections ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_git_connections_app ON git_connections(app_id);

ALTER TABLE analysis_cache ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analysis_cache_app ON analysis_cache(app_id);

ALTER TABLE scans ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_scans_app ON scans(app_id);

ALTER TABLE findings ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_findings_app ON findings(app_id);

ALTER TABLE custom_rules ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_custom_rules_app ON custom_rules(app_id);

ALTER TABLE opengrep_rules ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opengrep_rules_app ON opengrep_rules(app_id);

ALTER TABLE sonarqube_rules ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sonarqube_rules_app ON sonarqube_rules(app_id);

ALTER TABLE notification_channels ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_channels_app ON notification_channels(app_id);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_app ON notifications(app_id);

ALTER TABLE server_providers ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_server_providers_app ON server_providers(app_id);

ALTER TABLE deployments ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deployments_app ON deployments(app_id);

ALTER TABLE builds ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_builds_app ON builds(app_id);

ALTER TABLE ssh_keys ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ssh_keys_app ON ssh_keys(app_id);
