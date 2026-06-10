CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(organization_id, read) WHERE read = false;
