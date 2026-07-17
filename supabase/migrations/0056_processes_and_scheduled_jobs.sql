-- Background processes and scheduled jobs for project management

CREATE TABLE IF NOT EXISTS background_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'queue_worker' CHECK (type IN ('queue_worker', 'custom')),
  command TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (status IN ('running', 'stopped', 'errored')),
  -- Queue worker config
  runtime TEXT NOT NULL DEFAULT 'node',
  runtime_version TEXT,
  connection TEXT,
  num_processes INTEGER NOT NULL DEFAULT 1,
  queue TEXT,
  backoff INTEGER NOT NULL DEFAULT 0,
  sleep INTEGER NOT NULL DEFAULT 3,
  rest INTEGER NOT NULL DEFAULT 0,
  timeout INTEGER NOT NULL DEFAULT 60,
  tries INTEGER NOT NULL DEFAULT 1,
  memory INTEGER NOT NULL DEFAULT 128,
  env TEXT,
  force BOOLEAN NOT NULL DEFAULT false,
  -- Custom config
  working_directory TEXT,
  graceful_shutdown INTEGER NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_background_processes_project
  ON background_processes (project_id);

CREATE INDEX IF NOT EXISTS idx_background_processes_org
  ON background_processes (organization_id);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  "user" TEXT NOT NULL DEFAULT 'root',
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('every_minute', 'hourly', 'nightly', 'weekly', 'monthly', 'on_reboot', 'custom')),
  custom_cron TEXT,
  monitor_heartbeat BOOLEAN NOT NULL DEFAULT false,
  heartbeat_url TEXT,
  status TEXT NOT NULL DEFAULT 'installed' CHECK (status IN ('installed', 'paused')),
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_project
  ON scheduled_jobs (project_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_org
  ON scheduled_jobs (organization_id);
