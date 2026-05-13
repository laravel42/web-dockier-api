CREATE TABLE IF NOT EXISTS ssh_keys (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL,
    public_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ssh_keys_app ON ssh_keys(app_id);

ALTER TABLE ssh_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view ssh keys" ON ssh_keys;
CREATE POLICY "Authenticated can view ssh keys" ON ssh_keys FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE TRIGGER trg_ssh_keys_updated
BEFORE UPDATE ON ssh_keys
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
