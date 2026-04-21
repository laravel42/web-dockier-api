CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    app_id              TEXT NOT NULL,
    role_id             TEXT,
    email               TEXT UNIQUE NOT NULL,
    password_hash       TEXT,
    name                TEXT NOT NULL DEFAULT '',
    avatar_url          TEXT,
    country             TEXT NOT NULL DEFAULT '',
    language            TEXT NOT NULL DEFAULT 'en',
    timezone            TEXT NOT NULL DEFAULT 'UTC',
    two_factor_enabled  BOOLEAN NOT NULL DEFAULT false,
    two_factor_secret   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_app   ON users(app_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role_id);
