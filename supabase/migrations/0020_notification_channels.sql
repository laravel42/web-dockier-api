CREATE TABLE IF NOT EXISTS notification_channels (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_org ON notification_channels(organization_id);
