-- ============================================================
-- Remove user_id from all tables (except users and social_connections)
-- Tenant isolation is now via app_id only
-- ============================================================

ALTER TABLE roles DROP COLUMN IF EXISTS user_id;
ALTER TABLE projects DROP COLUMN IF EXISTS user_id;
ALTER TABLE git_connections DROP COLUMN IF EXISTS user_id;
ALTER TABLE scans DROP COLUMN IF EXISTS user_id;
ALTER TABLE custom_rules DROP COLUMN IF EXISTS user_id;
ALTER TABLE notification_channels DROP COLUMN IF EXISTS user_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS user_id;
ALTER TABLE server_providers DROP COLUMN IF EXISTS user_id;
ALTER TABLE deployments DROP COLUMN IF EXISTS user_id;
ALTER TABLE builds DROP COLUMN IF EXISTS user_id;
ALTER TABLE ssh_keys DROP COLUMN IF EXISTS user_id;

-- Drop old user_id indexes
DROP INDEX IF EXISTS idx_roles_user;
DROP INDEX IF EXISTS idx_git_connections_user;
DROP INDEX IF EXISTS idx_scans_user;
DROP INDEX IF EXISTS idx_custom_rules_user;
DROP INDEX IF EXISTS idx_notification_channels_user;
DROP INDEX IF EXISTS idx_notifications_user;
DROP INDEX IF EXISTS idx_notifications_unread;
DROP INDEX IF EXISTS idx_server_providers_user;
DROP INDEX IF EXISTS idx_deployments_user;
DROP INDEX IF EXISTS idx_builds_user;
DROP INDEX IF EXISTS idx_ssh_keys_user;

-- Recreate notifications unread index without user_id
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(app_id, read) WHERE read = false;
