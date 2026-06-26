CREATE TABLE IF NOT EXISTS commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    command TEXT NOT NULL CHECK (char_length(command) <= 2000),
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'finished', 'failed', 'timed_out')),
    output TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commands_project ON commands(project_id);
CREATE INDEX IF NOT EXISTS idx_commands_org ON commands(organization_id);
CREATE INDEX IF NOT EXISTS idx_commands_project_created ON commands(project_id, created_at DESC);
