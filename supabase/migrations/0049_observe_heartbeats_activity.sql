-- Observe feature: heartbeats monitoring and project activity log

-- Heartbeats: scheduled task monitoring via ping URLs
CREATE TABLE IF NOT EXISTS heartbeats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  frequency       TEXT NOT NULL DEFAULT 'every_minute'
                  CHECK (frequency IN (
                    'every_minute', 'every_5_minutes', 'every_10_minutes',
                    'every_15_minutes', 'every_30_minutes', 'hourly',
                    'daily', 'weekly', 'monthly', 'custom'
                  )),
  grace_period    TEXT NOT NULL DEFAULT 'after_5_minutes'
                  CHECK (grace_period IN (
                    'after_1_minute', 'after_5_minutes', 'after_10_minutes',
                    'after_15_minutes', 'after_30_minutes', 'after_1_hour'
                  )),
  status          TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('healthy', 'missed', 'waiting')),
  last_pinged_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_project
  ON heartbeats (organization_id, project_id);

-- Activity log: tracks project events (deploys, config changes, commands, etc.)
CREATE TABLE IF NOT EXISTS project_activity (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL
                  CHECK (event_type IN (
                    'deploy_started', 'deploy_completed', 'deploy_failed',
                    'command_run', 'config_changed', 'heartbeat_missed',
                    'heartbeat_recovered', 'log_cleared', 'project_updated',
                    'domain_added', 'domain_removed', 'security_rule_added',
                    'security_rule_removed'
                  )),
  description     TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_activity_project
  ON project_activity (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_project_activity_created
  ON project_activity (project_id, created_at DESC);
