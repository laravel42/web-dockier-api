CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_app ON notifications(app_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(app_id, read) WHERE read = false;
