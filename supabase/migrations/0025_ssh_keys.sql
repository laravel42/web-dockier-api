CREATE TABLE IF NOT EXISTS ssh_keys (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL,
    public_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ssh_keys_org ON ssh_keys(organization_id);
